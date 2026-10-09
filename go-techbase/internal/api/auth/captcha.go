// 图形验证码 —— 本地登录安控加强。
//
// 自绘 SVG(无第三方依赖):4 位随机码(去掉易混淆字符),大小写不敏感;
// 验证码一次性,5 分钟过期,答错即作废。SSO(Casdoor/ZITADEL)跳转登录不受影响。
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
)

const captchaTTL = 5 * time.Minute

// captchaEntry 一条待验证的验证码。
type captchaEntry struct {
	answer  string
	expires time.Time
}

var captchaStore = struct {
	sync.Mutex
	m map[string]captchaEntry
}{m: map[string]captchaEntry{}}

// captchaCharset 去掉 0/O/1/I/l 等易混淆字符。
const captchaCharset = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// Captcha 下发图形验证码:GET /api/auth/captcha → {captcha_id, image}。
func Captcha(c *gin.Context) {
	code := randomCode(4)
	id := randomCode(16) + fmtTime()
	captchaStore.Lock()
	// 顺手清理过期项,防止内存无界增长
	now := time.Now()
	for k, e := range captchaStore.m {
		if now.After(e.expires) {
			delete(captchaStore.m, k)
		}
	}
	captchaStore.m[id] = captchaEntry{answer: code, expires: now.Add(captchaTTL)}
	captchaStore.Unlock()

	svg := renderSVG(code)
	common.OKJSON(c, gin.H{
		"captcha_id": id,
		"image":      "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg)),
		"ttl":        int(captchaTTL.Seconds()),
	}, "")
}

// VerifyCaptcha 校验并销毁(一次性)。id 为空直接 false。
func VerifyCaptcha(id, code string) bool {
	if id == "" || code == "" {
		return false
	}
	captchaStore.Lock()
	e, ok := captchaStore.m[id]
	if ok {
		delete(captchaStore.m, id) // 无论对错都销毁,防重放
	}
	captchaStore.Unlock()
	if !ok || time.Now().After(e.expires) {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(code), e.answer)
}

func randomCode(n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(captchaCharset)))
	for i := range b {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			v = big.NewInt(time.Now().UnixNano() % max.Int64())
		}
		b[i] = captchaCharset[v.Int64()]
	}
	return string(b)
}

func fmtTime() string { return strings.ToLower(randBase32(time.Now().UnixNano())) }

func randBase32(v int64) string {
	const digits = "0123456789abcdefghijklmnopqrstuv"
	out := make([]byte, 0, 12)
	for ; v > 0; v >>= 5 {
		out = append(out, digits[v&31])
	}
	return string(out)
}

// palette 低饱和底色,与登录页白底蓝字风格一致。
var palette = []string{"#e8f1fd", "#eef7ee", "#fdf3e7", "#f3eefb"}

// renderSVG 画 4 位字符(随机旋转/错位/颜色)+ 噪声线。
func renderSVG(code string) string {
	var sb strings.Builder
	bg := palette[int(code[0])%len(palette)]
	sb.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">`)
	sb.WriteString(`<rect width="120" height="40" rx="6" fill="` + bg + `"/>`)
	// 噪声线
	colors := []string{"#4c7dd0", "#5aa35a", "#c9803e", "#8a6fc0"}
	for i := 0; i < 4; i++ {
		x1 := 8 + i*26 + int(code[i]%9)
		sb.WriteString(`<line x1="` + itoa(x1) + `" y1="` + itoa(4+int(code[(i+1)%4])%30) +
			`" x2="` + itoa(x1+18) + `" y2="` + itoa(6+int(code[(i+2)%4])%28) +
			`" stroke="` + colors[i] + `" stroke-width="1" opacity="0.5"/>`)
	}
	// 字符:逐个旋转、抖动基线
	for i, ch := range code {
		x := 14 + i*25
		y := 27 + int(ch)%5
		rot := (int(ch)%14 - 7) * (i%2*2 + 1) // -14..14 度,交替方向
		fc := colors[int(ch)%len(colors)]
		sb.WriteString(`<text x="` + itoa(x) + `" y="` + itoa(y) +
			`" font-family="Georgia,serif" font-size="24" font-weight="bold" fill="` + fc +
			`" transform="rotate(` + itoa(rot) + ` ` + itoa(x+8) + ` ` + itoa(y-8) + `)">` +
			string(ch) + `</text>`)
	}
	sb.WriteString(`</svg>`)
	return sb.String()
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
