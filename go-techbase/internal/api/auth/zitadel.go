package auth

import (
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/auth"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

func authMode() string      { return config.Config.Auth.Mode }
func allowLocalLogin() bool { return config.Config.Auth.AllowLocalLogin }

// ---------- OIDC state→verifier 暂存(PKCE) ----------

type pendingStore struct {
	mu   sync.Mutex
	data map[string]string
}

var pendingStates = &pendingStore{data: map[string]string{}}

func (p *pendingStore) set(state, verifier string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	// 简单容量保护:超 1000 清空(实现从简,底座不引入额外依赖)
	if len(p.data) > 1000 {
		p.data = map[string]string{}
	}
	p.data[state] = verifier
}

func (p *pendingStore) take(state string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	verifier, ok := p.data[state]
	delete(p.data, state)
	return verifier, ok
}

// ZitadelLoginURL zitadel 模式授权地址(PKCE verifier 由服务端暂存 state 映射)。
func ZitadelLoginURL(c *gin.Context) {
	state := auth.NewState()
	verifier := auth.NewState()
	pendingStates.set(state, verifier)
	raw, err := auth.AuthorizeURL(state, auth.PKCEChallenge(verifier))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	c.JSON(200, errcode.OK(gin.H{"url": raw}))
}

// ZitadelCallback 授权回调:code 换 token(PKCE verifier 配对)→ userinfo → 本地用户 → 签发会话。
func ZitadelCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	verifier, _ := pendingStates.take(state)
	if code == "" || state == "" || verifier == "" {
		c.String(400, "state 校验失败")
		return
	}
	tr, err := auth.ExchangeCode(c.Request.Context(), code, verifier)
	if err != nil {
		c.JSON(200, errcode.New(errcode.ErrToken, err.Error(), nil))
		return
	}
	ui, err := auth.FetchUserinfo(c.Request.Context(), tr.AccessToken)
	if err != nil {
		c.JSON(200, errcode.New(errcode.ErrToken, err.Error(), nil))
		return
	}
	username := oidcUsername(ui)
	uid := ensureUserFromOIDC(ui, config.Config.Auth.RoleClaim, config.Config.Auth.AutoProvision, config.Config.Auth.DefaultRoleCodes)
	if uid == 0 {
		c.JSON(200, errcode.New(errcode.ErrToken, "用户未注册且未开启自动 provisioning", nil))
		return
	}
	tk, err := auth.IssueLocalToken(uid, username)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	// 重定向回前端并携带令牌(#fragment,不经服务器日志)
	// BaseURL 配置后为绝对地址——前端在独立域(nginx 容器)时,authorize 的 redirect_uri
	// 落在后端域,相对 302 会把浏览器留在后端域造成死链(演示环境实测)。
	base := strings.TrimRight(config.Config.Frontend.BaseURL, "/")
	c.Redirect(302, base+"/login#token="+tk)
}

// ---------- ZITADEL 用户映射 ----------

// ensureUserFromZitadel 按 userinfo 取/建本地用户(claim 角色 + 默认角色)。
// 已存在用户且本次声明携带角色时,重新同步角色(ZITADEL 角色变更在下次登录生效)。
// oidcUsername 从 userinfo 提取本地用户名(多级兜底)。
// Casdoor 的 sub 是 "owner/name" 形态且 preferred_username 可能缺失,
// 依次取:preferred_username → name → email 本地段 → sub 的 name 段。
func oidcUsername(ui *auth.UserInfo) string {
	if s := strings.TrimSpace(ui.PreferredUsername); s != "" && !strings.Contains(s, "/") {
		return s
	}
	if v, ok := ui.Everything["name"].(string); ok {
		if s := strings.TrimSpace(v); s != "" && !strings.Contains(s, "/") {
			return s
		}
	}
	if v, ok := ui.Everything["email"].(string); ok {
		if s := strings.TrimSpace(v); strings.Contains(s, "@") {
			if lp := strings.SplitN(s, "@", 2)[0]; lp != "" {
				return lp
			}
		}
	}
	if s := strings.TrimSpace(ui.Sub); strings.Contains(s, "/") {
		if seg := strings.SplitN(s, "/", 2)[1]; seg != "" {
			return seg
		}
	}
	return strings.TrimSpace(ui.Sub)
}

// ensureUserFromOIDC 按 userinfo 取/建本地用户（claim 角色 + 默认角色）——ZITADEL/Casdoor 共用。
// 已存在用户且本次声明携带角色时,重新同步角色（IdP 角色变更在下次登录生效）。
func ensureUserFromOIDC(ui *auth.UserInfo, roleClaim string, autoProvision bool, defaultRoleCodes string) int64 {
	username := oidcUsername(ui)
	claimRoles := auth.RoleClaims(ui)
	if user, err := service.GetUserByUsername(username); err == nil && user != nil {
		uid := service.Int(user["id"])
		if len(claimRoles) > 0 {
			_ = service.SyncUserRolesByCodes(uid, claimRoles)
		}
		return uid
	}
	if !autoProvision {
		return 0
	}
	uid, err := service.CreateUser(map[string]any{
		"username":   username,
		"password":   "zitadel-managed:" + auth.NewState(),
		"real_name":  orDefaultStr(ui.Name, username),
		"actor_type": "HUMAN",
		"status":     1,
	})
	if err != nil {
		return 0
	}
	seen := map[string]bool{}
	var roleIDs []any
	appendRole := func(code string) {
		code = common.Trim(code)
		if code == "" || seen[code] {
			return
		}
		seen[code] = true
		if role, err := service.GetRoleByCode(code); err == nil && role != nil {
			roleIDs = append(roleIDs, service.Int(role["id"]))
		}
	}
	for _, code := range claimRoles {
		appendRole(code)
	}
	// 默认角色兜底(仅新用户且声明未携带角色)
	if len(roleIDs) == 0 {
		for _, code := range splitCSV(defaultRoleCodes) {
			appendRole(code)
		}
	}
	if len(roleIDs) > 0 {
		_ = service.AssignRoles(uid, roleIDs)
	}
	return uid
}

func orDefaultStr(v any, def any) any {
	if v == nil || service.Str(v) == "" {
		return def
	}
	return v
}

func splitCSV(s string) []string {
	out := []string{}
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			if i > start {
				out = append(out, s[start:i])
			}
			start = i + 1
		}
	}
	return out
}

var _ = time.Now
