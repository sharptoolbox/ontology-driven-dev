// 管理控制台写操作审计 —— 操作日志埋点（用户规则 2026-10）。
//
// 对 /api/admin/* 的 POST/PUT/DELETE 统一记录 audit_logs（action='OPERATE'），
// detail 含方法/路径/请求体摘要（密钥与口令字段脱敏）。以后新增管理接口自动纳入。
package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	// CtxUserID/CtxUsername 位于 service 包(context 键)
)

// sensitiveRe 请求体摘要脱敏（api_key/client_secret/password/jwt_secret 等字段值）。
var sensitiveRe = regexp.MustCompile(`(?i)("(?:api_key|client_secret|password|jwt_secret|secret)"\s*:\s*")([^"]*)(")`)

// OperationAudit 管理写操作审计中间件（须挂在 LoginRequired 之后以取到用户）。
func OperationAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := strings.ToUpper(c.Request.Method)
		if method != http.MethodPost && method != http.MethodPut && method != http.MethodDelete {
			c.Next()
			return
		}
		// 缓存请求体（handler 仍可正常绑定）
		var bodySnippet string
		if c.Request.Body != nil {
			raw, _ := io.ReadAll(io.LimitReader(c.Request.Body, 4<<10))
			_ = c.Request.Body.Close()
			c.Request.Body = io.NopCloser(bytes.NewBuffer(raw))
			if json.Valid(raw) {
				bodySnippet = sensitiveRe.ReplaceAllString(string(raw), `${1}***${3}`)
			}
		}

		c.Next()

		// 仅记录成功写操作（业务失败由 errcode 信封体现在 body,但 200+失败也留痕价值有限;
		// 以 HTTP 状态为准,2xx 记 OPERATE）
		if c.Writer.Status() < 200 || c.Writer.Status() >= 300 {
			return
		}
		uid, uname := commonUserOf(c)
		detail := method + " " + c.Request.URL.Path
		if bodySnippet != "" {
			detail += " " + truncateStr2(bodySnippet, 240)
		}
		service.WriteAudit(nil, uid, uname, "OPERATE", detail)
	}
}

// commonUserOf 从请求上下文取登录用户(LoginRequired 已写入;取不到则为 anonymous)。
func commonUserOf(c *gin.Context) (id int64, username string) {
	ctx := c.Request.Context()
	if v := ctx.Value(service.CtxUserID); v != nil {
		switch x := v.(type) {
		case int64:
			id = x
		case float64:
			id = int64(x)
		}
	}
	if v := ctx.Value(service.CtxUsername); v != nil {
		username, _ = v.(string)
	}
	if username == "" {
		username = "anonymous"
	}
	return id, username
}

func truncateStr2(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
