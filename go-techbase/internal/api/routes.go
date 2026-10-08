// Package api —— Gin 路由注册(gopherforge internal/api 模式:公开组 + 登录组 + 权限中间件按路由挂载)。
//
// 路由表与重构前(hertz router/v1)逐条一致,API 契约不变。
package api

import (
	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/adminconsole"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/auth"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/business"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/flow"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/meta"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/system"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/middleware"
)

// SetupRoutes 挂载 /api 路由。
func SetupRoutes(r *gin.Engine) {
	api := r.Group("/api")

	// ---- 公开路由(认证入口) ----
	pub := api.Group("")
	{
		pub.POST("/auth/login", auth.Login)
		pub.GET("/auth/mode", auth.AuthMode)
		pub.GET("/auth/captcha", auth.Captcha)
		pub.GET("/auth/login-url", auth.ZitadelLoginURL)
		pub.GET("/auth/callback", auth.ZitadelCallback)
		// 用户工作台 SSO（OPIC-SSO-01：Casdoor）
		pub.GET("/auth/casdoor/login-url", auth.CasdoorLoginURL)
		pub.GET("/auth/casdoor/callback", auth.CasdoorCallback)
	}

	// ---- 登录路由组 ----
	authed := api.Group("", middleware.LoginRequired())
	{
		// 认证
		authed.POST("/auth/logout", auth.Logout)
		authed.GET("/auth/info", auth.Info)

		// 元数据(登录即可)
		authed.GET("/meta/dictionaries", meta.Dictionaries)
		authed.GET("/meta/customer-status", meta.CustomerStatus)
		authed.POST("/assistant/chat", business.AssistantChat)
		authed.GET("/assistant/models", business.AssistantModels)
		authed.GET("/meta/rules", meta.Rules)

		// 客户申请(登录即可;业务校验在服务层)
		authed.GET("/customer", business.CustomerList)
		authed.GET("/customer/:id", business.CustomerGet)
		authed.POST("/customer/draft", business.CustomerCreateDraft)
		authed.PUT("/customer/:id/draft", business.CustomerUpdateDraft)
		authed.POST("/customer/:id/submit", business.CustomerSubmit)
		authed.POST("/customer/:id/withdraw", business.CustomerWithdraw)

		// 审批中心(登录即可;归属校验在服务层)
		authed.GET("/workbench/todo", business.WorkbenchTodo)
		authed.GET("/workbench/done", business.WorkbenchDone)
		authed.GET("/workbench/requested", business.WorkbenchRequested)
		authed.POST("/workbench/todo/:id/approve", business.WorkbenchApprove)
		authed.POST("/workbench/todo/:id/reject", business.WorkbenchReject)
		authed.POST("/workbench/todo/:id/return", business.WorkbenchReturn)

		// 流程查询(登录即可)
		authed.GET("/flow/definitions", flow.DefinitionList)
		authed.GET("/flow/definitions/:id", flow.DefinitionGet)
		authed.GET("/flow/definitions/:id/graph", flow.DefinitionGraph)
		authed.GET("/flow/instances", flow.InstanceList)
		authed.GET("/flow/instances/:id", flow.InstanceGet)
		authed.GET("/flow/tasks", flow.TaskList)

		// ---- 管理控制台补齐(gopherforge 基准):日志审计/在线用户/公告/错误码/系统监控 ----
		admin := api.Group("/admin", middleware.LoginRequired(), middleware.OperationAudit())
		{
			g := admin.Group("", middleware.RequirePermission("system:manage"))
			adminconsole.RegisterTemporalFlow(g)
			g.GET("/llm-config", adminconsole.LLMConfigGet)
			g.PUT("/llm-config", adminconsole.LLMConfigSave)
			// AI 模型设置:多供应商账号管理
			g.GET("/ai/catalog", adminconsole.AICatalog)
			g.GET("/ai/accounts", adminconsole.AIAccountList)
			g.POST("/ai/accounts", adminconsole.AIAccountCreate)
			g.PUT("/ai/accounts/:id", adminconsole.AIAccountUpdate)
			g.DELETE("/ai/accounts/:id", adminconsole.AIAccountDelete)
			g.POST("/ai/accounts/:id/test", adminconsole.AIAccountTest)
			g.GET("/ai/upstream-models", adminconsole.AIUpstreamModels)
			g.GET("/isolation", adminconsole.IsolationInfo)
			g.GET("/logs/operation", adminconsole.OperationLogs)
			g.GET("/logs/login", adminconsole.LoginLogs)
			g.GET("/logs/audit", adminconsole.AuditLogs)
			g.GET("/online-users", adminconsole.OnlineUsers)
			g.GET("/notice", adminconsole.NoticeList)
			g.POST("/notice", adminconsole.NoticeSave)
			g.PUT("/notice/:id", adminconsole.NoticeSave)
			g.DELETE("/notice/:id", adminconsole.NoticeDelete)
			g.GET("/errcodes", adminconsole.ErrCodes)
			g.GET("/system-stats", adminconsole.SystemStats)
		}

		// 系统查询(登录即可)
		authed.GET("/users", system.UserList)
		authed.GET("/users/options", system.UserOptions)
		authed.GET("/roles", system.RoleList)
		authed.GET("/permissions", system.PermissionList)
		authed.GET("/permissions/all", system.PermissionAll)
		authed.GET("/resources", system.ResourceList)
		authed.GET("/resources/tree", system.ResourceTree)

		// ---- 写操作:按权限码挂载中间件 ----
		perm := func(code string, handler gin.HandlerFunc) []gin.HandlerFunc {
			return []gin.HandlerFunc{middleware.RequirePermission(code), handler}
		}

		// 用户管理
		authed.POST("/users", perm("system:user:add", system.UserCreate)...)
		authed.PUT("/users/:id", perm("system:user:edit", system.UserUpdate)...)
		authed.DELETE("/users/:id", perm("system:user:delete", system.UserDelete)...)
		authed.PUT("/users/:id/roles", perm("system:user:assign-role", system.UserAssignRoles)...)
		authed.PUT("/users/:id/reset-pwd", perm("system:user:reset-pwd", system.UserResetPwd)...)

		// 角色管理
		authed.POST("/roles", perm("system:role:add", system.RoleCreate)...)
		authed.PUT("/roles/:id", perm("system:role:edit", system.RoleUpdate)...)
		authed.DELETE("/roles/:id", perm("system:role:delete", system.RoleDelete)...)
		authed.PUT("/roles/:id/permissions", perm("system:role:assign", system.RoleAssignPermissions)...)
		authed.PUT("/roles/:id/resources", perm("system:role:assign", system.RoleAssignResources)...)

		// 权限管理
		authed.POST("/permissions", perm("system:permission:add", system.PermissionCreate)...)
		authed.PUT("/permissions/:id", perm("system:permission:edit", system.PermissionUpdate)...)
		authed.DELETE("/permissions/:id", perm("system:permission:delete", system.PermissionDelete)...)

		// 资源管理
		authed.POST("/resources", perm("system:resource:add", system.ResourceCreate)...)
		authed.PUT("/resources/:id", perm("system:resource:edit", system.ResourceUpdate)...)
		authed.DELETE("/resources/:id", perm("system:resource:delete", system.ResourceDelete)...)

		// 流程管理写操作
		authed.POST("/flow/definitions", perm("flow:definition:add", flow.DefinitionCreate)...)
		authed.PUT("/flow/definitions/:id", perm("flow:definition:edit", flow.DefinitionUpdate)...)
		authed.POST("/flow/definitions/:id/publish", perm("flow:definition:publish", flow.DefinitionPublish)...)
		authed.PUT("/flow/instances/:id/terminate", perm("flow:instance:terminate", flow.InstanceTerminate)...)
		authed.PUT("/flow/tasks/:id/transfer", perm("flow:task:transfer", flow.TaskTransfer)...)
		authed.PUT("/flow/tasks/:id/urge", perm("flow:task:urge", flow.TaskUrge)...)
	}
}
