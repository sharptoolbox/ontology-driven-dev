// Package errcode —— OPIC 架构元数据域(O-ARC)统一错误码的 Go 实现。
//
// 规范要点(design.md D1/D2/D4):
//   - 7 位错误码 = [3 位大写字母前缀(能力中心标识)][4 位数字自定义]
//   - 成功码全平台唯一: SUC0000
//   - 业务错误 0001-8999;系统错误 9000-9999
//   - 标准化 JSON 响应结构: {"returnInfo":{"returnCode":"SUC0000","errorMsg":""},"data":{...}}
//
// 前缀注册遵循 O-ARC 前缀分配表;go-techbase 作为技术底座使用 `SYS`(底座平台)前缀。
// 新增前缀须经架构管理中心错误码注册平台登记后使用。
package errcode

import (
	"fmt"
	"regexp"
)

// ReturnInfo 标准化响应头(O-ARC D4)。
type ReturnInfo struct {
	ReturnCode string `json:"returnCode"`
	ErrorMsg   string `json:"errorMsg"`
}

// Envelope 标准化响应包。
type Envelope struct {
	ReturnInfo ReturnInfo `json:"returnInfo"`
	Data       any        `json:"data"`
}

// Success 全平台唯一成功码。
const Success = "SUC0000"

// ErrCode 错误码类型(7 位字符串)。
type ErrCode string

// 前缀:底座平台(经 O-ARC 分配表,SYS = 底座平台)。
const Prefix = "SYS"

// 业务错误(0001-8999)。
const (
	ErrParam           ErrCode = Prefix + "1001" // 参数错误
	ErrNotFound        ErrCode = Prefix + "1002" // 对象不存在
	ErrDuplicate       ErrCode = Prefix + "1003" // 唯一性冲突
	ErrState           ErrCode = Prefix + "1004" // 状态不允许该操作
	ErrFlowState       ErrCode = Prefix + "1005" // 流程状态错误(已处理/已结束)
	ErrTaskNotOwner    ErrCode = Prefix + "1006" // 任务不属于当前用户
	ErrFlowNotPublished ErrCode = Prefix + "1007" // 流程未发布
	ErrGraph           ErrCode = Prefix + "1008" // 流程图非法
	ErrRule            ErrCode = Prefix + "1009" // 规则校验未通过
)

// 系统/安全错误(9000-9999 及认证鉴权)。
const (
	ErrAuthServer ErrCode = Prefix + "9001" // 服务内部错误
	ErrDB         ErrCode = Prefix + "9002" // 数据库错误
	ErrConfig     ErrCode = Prefix + "9003" // 配置错误
	ErrUnAuth     ErrCode = Prefix + "9101" // 未登录或凭证失效
	ErrToken      ErrCode = Prefix + "9102" // 凭证无效
	ErrForbidden  ErrCode = Prefix + "9103" // 无权限
	ErrLogin      ErrCode = Prefix + "9104" // 用户名或密码错误/账号禁用
)

var codeRe = regexp.MustCompile(`^[A-Z]{3}\d{4}$`)

// BizErr 业务错误(带错误码),由控制器统一转标准响应。
type BizErr struct {
	Code ErrCode
	Msg  string
}

// Error 实现 error。
func (e *BizErr) Error() string { return e.Msg }

// Fail 业务错误快捷构造。
func Fail(code ErrCode, format string, args ...any) *BizErr {
	return &BizErr{Code: code, Msg: fmt.Sprintf(format, args...)}
}

// Validate 校验错误码格式。
func Validate(code string) bool { return code == Success || codeRe.MatchString(code) }

// New 构造响应包。
func New(code ErrCode, msg string, data any) Envelope {
	c := string(code)
	if !Validate(c) {
		c = string(ErrAuthServer)
	}
	return Envelope{ReturnInfo: ReturnInfo{ReturnCode: c, ErrorMsg: msg}, Data: data}
}

// OK 成功响应包。
func OK(data any) Envelope { return New(Success, "", data) }

// Error 快捷构造错误响应包。
func Error(code ErrCode, format string, args ...any) Envelope {
	msg := format
	if len(args) > 0 {
		msg = fmt.Sprintf(format, args...)
	}
	return New(code, msg, nil)
}

// NamedCode 供管理端展示的错误码条目。
type NamedCode struct {
	Code ErrCode `json:"code"`
	Desc string  `json:"desc"`
}

// AllCodes 全量登记码（O-ARC 注册表的 Go 侧视图；新增码须同步本表——错误码注册纪律）。
func AllCodes() []NamedCode {
	return []NamedCode{
		{ErrParam, "参数错误"},
		{ErrNotFound, "对象不存在"},
		{ErrDuplicate, "唯一性冲突"},
		{ErrState, "状态不允许该操作"},
		{ErrFlowState, "流程状态错误(已处理/已结束)"},
		{ErrTaskNotOwner, "任务不属于当前用户"},
		{ErrFlowNotPublished, "流程未发布"},
		{ErrGraph, "流程图非法"},
		{ErrRule, "规则校验未通过"},
		{Success, "成功"},
		{ErrAuthServer, "认证服务内部错误"},
		{ErrDB, "数据库错误"},
		{ErrConfig, "配置错误"},
		{ErrUnAuth, "未登录或凭证失效"},
		{ErrToken, "凭证无效"},
		{ErrForbidden, "无权限"},
		{ErrLogin, "用户名或密码错误/账号禁用"},
	}
}
