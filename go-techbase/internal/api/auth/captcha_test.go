package auth

import (
	"strings"
	"testing"
	"time"
)

func TestVerifyCaptcha(t *testing.T) {
	id := randomCode(16)
	captchaStore.m[id] = captchaEntry{answer: "Ab3d", expires: time.Now().Add(captchaTTL)}

	// 大小写不敏感 + 首尾空白容忍
	if !VerifyCaptcha(id, " ab3D ") {
		t.Fatal("正确验证码应通过(大小写不敏感)")
	}
	// 一次性:销毁后同码重放必须失败
	if VerifyCaptcha(id, "Ab3d") {
		t.Fatal("验证码应一次性,重放须失败")
	}

	// 过期
	id2 := randomCode(16)
	captchaStore.m[id2] = captchaEntry{answer: "XY7K", expires: time.Now().Add(-time.Minute)}
	if VerifyCaptcha(id2, "XY7K") {
		t.Fatal("过期验证码须失败")
	}

	// 空入参
	if VerifyCaptcha("", "ABCD") || VerifyCaptcha("someid", "") {
		t.Fatal("空 id 或空码须失败")
	}
}

func TestCaptchaSVG(t *testing.T) {
	svg := renderSVG("A1B2")
	if !strings.HasPrefix(svg, `<svg xmlns="http://www.w3.org/2000/svg"`) {
		t.Fatal("SVG 输出格式不对")
	}
	for _, ch := range "A1B2" {
		if !strings.Contains(svg, string(ch)) {
			t.Fatalf("SVG 缺字符 %c", ch)
		}
	}
	if got := randomCode(4); len(got) != 4 {
		t.Fatalf("randomCode 长度=%d,应为 4", len(got))
	}
}
