// Package expr —— 轻量安全表达式求值器(替代 Python simpleeval)。
//
// 支持流程网关条件与 M3 规则表达式:标识符、数字、单/双引号字符串、
// true/false/null、比较(> >= < <= == !=)、逻辑(&&/||/and/or/!)、算术(+ - * / %)、括号。
// 仅求值,不产生副作用;任何解析/求值错误返回 error(调用方按 false 处理)。
package expr

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

type parser struct {
	src  string
	pos  int
	vars map[string]any
}

// Eval 求值表达式,返回结果与错误。
func Eval(src string, vars map[string]any) (any, error) {
	p := &parser{src: src, vars: vars}
	v, err := p.parseOr()
	if err != nil {
		return nil, err
	}
	p.skipWS()
	if p.pos < len(p.src) {
		return nil, fmt.Errorf("意外字符 %q @%d", p.peek(), p.pos)
	}
	return v, nil
}

// EvalBool 求值并转布尔;任何错误按 false 处理(与 simpleeval 容错口径一致)。
func EvalBool(src string, vars map[string]any) bool {
	v, err := Eval(src, vars)
	if err != nil {
		return false
	}
	return truthy(v)
}

func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	default:
		return true
	}
}

func (p *parser) peek() byte { return p.src[p.pos] }
func (p *parser) skipWS() {
	for p.pos < len(p.src) && unicode.IsSpace(rune(p.peek())) {
		p.pos++
	}
}
func (p *parser) lit(s string) bool {
	if strings.HasPrefix(p.src[p.pos:], s) {
		p.pos += len(s)
		return true
	}
	return false
}

func (p *parser) parseOr() (any, error) {
	left, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		if p.lit("||") || p.litWord("or") {
			right, err := p.parseAnd()
			if err != nil {
				return nil, err
			}
			left = truthy(left) || truthy(right)
			continue
		}
		return left, nil
	}
}

func (p *parser) litWord(w string) bool {
	save := p.pos
	p.skipWS()
	if !p.lit(w) {
		p.pos = save
		return false
	}
	// 词边界:后面不能是标识符字符
	if p.pos < len(p.src) && (unicode.IsLetter(rune(p.src[p.pos])) || p.src[p.pos] == '_') {
		p.pos = save
		return false
	}
	return true
}

func (p *parser) parseAnd() (any, error) {
	left, err := p.parseNot()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		if p.lit("&&") || p.litWord("and") {
			right, err := p.parseNot()
			if err != nil {
				return nil, err
			}
			left = truthy(left) && truthy(right)
			continue
		}
		return left, nil
	}
}

func (p *parser) parseNot() (any, error) {
	p.skipWS()
	if p.lit("!") || p.litWord("not") {
		v, err := p.parseNot()
		if err != nil {
			return nil, err
		}
		return !truthy(v), nil
	}
	return p.parseCompare()
}

func (p *parser) parseCompare() (any, error) {
	left, err := p.parseAdd()
	if err != nil {
		return nil, err
	}
	p.skipWS()
	for _, op := range []string{"==", "!=", ">=", "<=", ">", "<"} {
		if p.lit(op) {
			right, err := p.parseAdd()
			if err != nil {
				return nil, err
			}
			return compare(left, right, op)
		}
	}
	return left, nil
}

func num(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

func compare(a, b any, op string) (any, error) {
	// 数字比较
	if fa, oka := num(a); oka {
		if fb, okb := num(b); okb {
			return apply(fa, fb, op)
		}
	}
	sa, oka := a.(string)
	sb, okb := b.(string)
	if oka && okb {
		return applyStr(sa, sb, op)
	}
	// null 语义
	if a == nil || b == nil {
		switch op {
		case "==":
			return a == nil && b == nil, nil
		case "!=":
			return !(a == nil && b == nil), nil
		}
		return false, nil
	}
	return nil, fmt.Errorf("不可比较类型: %T vs %T", a, b)
}

func apply(fa, fb float64, op string) (bool, error) {
	switch op {
	case "==":
		return fa == fb, nil
	case "!=":
		return fa != fb, nil
	case ">":
		return fa > fb, nil
	case ">=":
		return fa >= fb, nil
	case "<":
		return fa < fb, nil
	case "<=":
		return fa <= fb, nil
	}
	return false, fmt.Errorf("未知比较符 %s", op)
}

func applyStr(sa, sb, op string) (bool, error) {
	switch op {
	case "==":
		return sa == sb, nil
	case "!=":
		return sa != sb, nil
	case ">":
		return sa > sb, nil
	case ">=":
		return sa >= sb, nil
	case "<":
		return sa < sb, nil
	case "<=":
		return sa <= sb, nil
	}
	return false, fmt.Errorf("未知比较符 %s", op)
}

func (p *parser) parseAdd() (any, error) {
	left, err := p.parseMul()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		var op string
		if p.lit("+") {
			op = "+"
		} else if p.lit("-") {
			op = "-"
		} else {
			return left, nil
		}
		right, err := p.parseMul()
		if err != nil {
			return nil, err
		}
		fa, oka := num(left)
		fb, okb := num(right)
		if oka && okb {
			if op == "+" {
				left = fa + fb
			} else {
				left = fa - fb
			}
			continue
		}
		return nil, fmt.Errorf("算术运算要求双方为数字")
	}
}

func (p *parser) parseMul() (any, error) {
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		var op string
		if p.lit("*") {
			op = "*"
		} else if p.lit("/") {
			op = "/"
		} else if p.lit("%") {
			op = "%"
		} else {
			return left, nil
		}
		right, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		fa, oka := num(left)
		fb, okb := num(right)
		if !oka || !okb {
			return nil, fmt.Errorf("算术运算要求双方为数字")
		}
		switch op {
		case "*":
			left = fa * fb
		case "/":
			if fb == 0 {
				return nil, fmt.Errorf("除零")
			}
			left = fa / fb
		case "%":
			if fb == 0 {
				return nil, fmt.Errorf("模零")
			}
			left = float64(int64(fa) % int64(fb))
		}
	}
}

func (p *parser) parseUnary() (any, error) {
	p.skipWS()
	if p.lit("-") {
		v, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		if f, ok := num(v); ok {
			return -f, nil
		}
		return nil, fmt.Errorf("- 要求数字")
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() (any, error) {
	p.skipWS()
	if p.pos >= len(p.src) {
		return nil, fmt.Errorf("表达式意外结束")
	}
	ch := p.peek()
	// 括号
	if ch == '(' {
		p.pos++
		v, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		p.skipWS()
		if !p.lit(")") {
			return nil, fmt.Errorf("缺少右括号")
		}
		return v, nil
	}
	// 字符串
	if ch == '\'' || ch == '"' {
		quote := ch
		p.pos++
		var sb strings.Builder
		for p.pos < len(p.src) {
			c := p.src[p.pos]
			if c == '\\' && p.pos+1 < len(p.src) {
				p.pos++
				sb.WriteByte(p.src[p.pos])
				p.pos++
				continue
			}
			if c == quote {
				p.pos++
				return sb.String(), nil
			}
			sb.WriteByte(c)
			p.pos++
		}
		return nil, fmt.Errorf("字符串未闭合")
	}
	// 数字
	if unicode.IsDigit(rune(ch)) {
		start := p.pos
		for p.pos < len(p.src) && (unicode.IsDigit(rune(p.src[p.pos])) || p.src[p.pos] == '.') {
			p.pos++
		}
		f, err := strconv.ParseFloat(p.src[start:p.pos], 64)
		if err != nil {
			return nil, fmt.Errorf("非法数字 %q", p.src[start:p.pos])
		}
		return f, nil
	}
	// 标识符/关键字
	if unicode.IsLetter(rune(ch)) || ch == '_' {
		start := p.pos
		for p.pos < len(p.src) && (unicode.IsLetter(rune(p.src[p.pos])) || unicode.IsDigit(rune(p.src[p.pos])) || p.src[p.pos] == '_') {
			p.pos++
		}
		word := p.src[start:p.pos]
		switch word {
		case "true":
			return true, nil
		case "false":
			return false, nil
		case "null", "None":
			return nil, nil
		}
		if v, ok := p.vars[word]; ok {
			return v, nil
		}
		// camelCase → snake_case 再查一次(Python 版回退口径)
		if v, ok := p.vars[toSnake(word)]; ok {
			return v, nil
		}
		return nil, fmt.Errorf("未知标识符 %q", word)
	}
	return nil, fmt.Errorf("意外字符 %q", ch)
}

func toSnake(name string) string {
	var sb strings.Builder
	for i, ch := range name {
		if unicode.IsUpper(ch) && i > 0 {
			sb.WriteByte('_')
		}
		sb.WriteRune(unicode.ToLower(ch))
	}
	return sb.String()
}
