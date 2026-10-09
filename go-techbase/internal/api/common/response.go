// Package common —— API 公共助手(统一 returnInfo 响应/参数解析;契约与旧版一致)。
package common

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

// OKJSON 成功响应(业务成功一律 200)。
func OKJSON(c *gin.Context, data any, msg string) {
	c.JSON(200, errcode.OK(data))
}

// FailJSON 业务错误响应(业务错误一律 200 + returnCode)。
func FailJSON(c *gin.Context, err error) {
	be := service.AsBizErr(err)
	c.JSON(200, errcode.New(be.Code, be.Msg, nil))
}

// AuthFail 认证失败(401)。
func AuthFail(c *gin.Context, code errcode.ErrCode, msg string) {
	c.JSON(401, errcode.New(code, msg, nil))
}

// BindJSON 绑定 body(容错:空/坏 body 视为空 map,与旧版 bindBody 一致)。
func BindJSON(c *gin.Context) map[string]any {
	var body map[string]any
	_ = c.ShouldBindJSON(&body)
	if body == nil {
		body = map[string]any{}
	}
	return body
}

// PageOf 解析 ?page=&size=(size 越界回退 10,契约不变)。
func PageOf(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 10
	}
	return page, size
}

// PathID 路径参数转 int64。
func PathID(c *gin.Context, name string) int64 {
	id, _ := strconv.ParseInt(c.Param(name), 10, 64)
	return id
}

// UserOf 当前用户(认证中间件写入 request context)。
func UserOf(c *gin.Context) service.UserInfo {
	return service.FromCtx(c.Request.Context())
}

// BearerToken 取 Bearer 令牌(无则空串)。
func BearerToken(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if len(h) > len("Bearer ") {
		return h[len("Bearer "):]
	}
	return ""
}

// Trim 去空白(any→string)。
func Trim(v any) string {
	return service.Str(v)
}

// OrEmpty nil → 空数组。
func OrEmpty(v any) any {
	if v == nil {
		return []any{}
	}
	return v
}
