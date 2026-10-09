// Package auth —— 认证控制器(登录/登出/当前用户/认证模式;契约与旧版一致)。
package auth

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/auth"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/token"
)

// Login 本地账号登录(local 模式)。须先通过图形验证码(安控加强)。
func Login(c *gin.Context) {
	body := common.BindJSON(c)
	if !VerifyCaptcha(common.Trim(body["captcha_id"]), common.Trim(body["captcha_code"])) {
		c.JSON(200, errcode.New(errcode.ErrLogin, "验证码错误或已过期", nil))
		return
	}
	username := common.Trim(body["username"])
	password := common.Trim(body["password"])
	if username == "" || password == "" {
		c.JSON(200, errcode.New(errcode.ErrLogin, "请输入用户名和密码", nil))
		return
	}
	user, errMsg := service.Login(username, password)
	if errMsg != "" {
		c.JSON(200, errcode.New(errcode.ErrLogin, errMsg, nil))
		return
	}
	tk, err := auth.IssueLocalToken(service.Int(user["id"]), service.Str(user["username"]))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	payload, err := service.BuildLoginPayload(nil, user)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	payload["token"] = tk
	service.WriteAudit(nil, service.Int(user["id"]), service.Str(user["username"]), "LOGIN", "")
	common.OKJSON(c, payload, "登录成功")
}

// Logout 退出(吊销当前会话令牌;Redis 未启用时仅审计,行为与旧版一致)。
func Logout(c *gin.Context) {
	u := common.UserOf(c)
	if claims, err := auth.ParseLocalToken(common.BearerToken(c)); err == nil && claims.ID != "" && claims.ExpiresAt != nil {
		if ttl := time.Until(claims.ExpiresAt.Time); ttl > 0 {
			_ = token.Revoke(claims.ID, ttl)
		}
	}
	service.WriteAudit(nil, u.ID, u.Username, "LOGOUT", "")
	common.OKJSON(c, nil, "已退出登录")
}

// Info 当前用户信息(user/permissions/menus)。
func Info(c *gin.Context) {
	u := common.UserOf(c)
	user, err := service.GetUser(u.ID)
	if err != nil || user == nil || service.Int(user["status"]) != 1 {
		common.AuthFail(c, errcode.ErrLogin, "账号不存在或已禁用")
		return
	}
	payload, err := service.BuildLoginPayload(nil, user)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, payload, "")
}

// AuthMode 当前认证模式(前端登录页据此分流)。
func AuthMode(c *gin.Context) {
	mode := authMode()
	localAllowed := mode == "local" || allowLocalLogin()
	// 用户工作台端（OPIC-SSO-01：casdoor）
	ua := config.Config.UserAuth
	userMode := ua.Mode
	if userMode == "" {
		userMode = "local"
	}
	// 用户端本地登录跟随全局 allow_local_login（用户规则 2026-10：SSO 模式下仍可切本地账号）
	userLocalAllowed := localAllowed
	c.JSON(200, errcode.OK(gin.H{
		"mode": mode, "allow_local_login": localAllowed, // 兼容旧前端（管理控制台端）
		"admin": gin.H{"mode": mode, "allow_local_login": localAllowed, "sso": mode == "zitadel"},
		"user":  gin.H{"mode": userMode, "allow_local_login": userLocalAllowed, "sso": userMode == "casdoor"},
	}))
}
