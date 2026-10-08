// Package adminconsole —— 管理控制台补齐端点（gopherforge 基准：日志审计/在线用户/公告/错误码/系统监控）。
// 全部挂 system:manage 权限（admin 超管 * 放行）。
package adminconsole

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/middleware"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

func pageOf(c *gin.Context) (int, int) {
	p, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	s, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	return p, s
}

func userOf(c *gin.Context) service.UserInfo {
	return service.FromCtx(c.Request.Context())
}

// OperationLogs GET /api/admin/logs/operation
func OperationLogs(c *gin.Context) {
	p, s := pageOf(c)
	page, err := service.AdminLogs("operation", p, s)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(page))
}

// LoginLogs GET /api/admin/logs/login
func LoginLogs(c *gin.Context) {
	p, s := pageOf(c)
	page, err := service.AdminLogs("login", p, s)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(page))
}

// AuditLogs GET /api/admin/logs/audit
func AuditLogs(c *gin.Context) {
	p, s := pageOf(c)
	page, err := service.AdminLogs("audit", p, s)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(page))
}

// OnlineUsers GET /api/admin/online-users
func OnlineUsers(c *gin.Context) {
	rows, err := service.AdminOnlineUsers()
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(rows))
}

// NoticeList GET /api/admin/notice
func NoticeList(c *gin.Context) {
	p, s := pageOf(c)
	page, err := service.AdminNoticeList(p, s)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(page))
}

type noticeBody struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Status  int    `json:"status"`
}

// NoticeSave POST/PUT /api/admin/notice
func NoticeSave(c *gin.Context) {
	var body noticeBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" {
		c.JSON(200, errcode.Error(errcode.ErrParam, "title 必填"))
		return
	}
	u := userOf(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	n, err := service.AdminNoticeSave(id, body.Title, body.Content, body.Status, u.ID, u.Username)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	_ = middleware.LoginRequired // 引用保持
	c.JSON(200, errcode.OK(gin.H{"affected": n, "id": id}))
}

// NoticeDelete DELETE /api/admin/notice/:id
func NoticeDelete(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	n, err := service.AdminNoticeDelete(id)
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(gin.H{"affected": n}))
}

// ErrCodes GET /api/admin/errcodes
func ErrCodes(c *gin.Context) {
	c.JSON(200, errcode.OK(errcode.AllCodes()))
}

// SystemStats GET /api/admin/system-stats
func SystemStats(c *gin.Context) {
	stats, err := service.AdminSystemStats()
	if err != nil {
		c.JSON(200, errcode.Error(errcode.ErrDB, "%s", err.Error()))
		return
	}
	c.JSON(200, errcode.OK(stats))
}
