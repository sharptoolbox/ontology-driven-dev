// Package system —— 系统管理控制器(用户/角色/权限/资源;契约与旧版一致)。
package system

import (
	"github.com/gin-gonic/gin"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
)

// ---------- 用户管理 ----------

// UserList GET /api/users
func UserList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListUsers(page, size, c.Query("keyword"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// UserOptions GET /api/users/options(角色下拉)
func UserOptions(c *gin.Context) {
	rows, err := service.ListRoleOptions()
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, rows, "")
}

// UserCreate POST /api/users
func UserCreate(c *gin.Context) {
	id, err := service.CreateUser(common.BindJSON(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": id}, "创建成功")
}

// UserUpdate PUT /api/users/:id
func UserUpdate(c *gin.Context) {
	if err := service.UpdateUser(common.PathID(c, "id"), common.BindJSON(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "更新成功")
}

// UserDelete DELETE /api/users/:id
func UserDelete(c *gin.Context) {
	if err := service.DeleteUser(common.PathID(c, "id")); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "删除成功")
}

// UserAssignRoles PUT /api/users/:id/roles
func UserAssignRoles(c *gin.Context) {
	body := common.BindJSON(c)
	roleIDs, _ := body["role_ids"].([]any)
	if err := service.AssignRoles(common.PathID(c, "id"), roleIDs); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "角色已更新")
}

// UserResetPwd PUT /api/users/:id/reset-pwd
func UserResetPwd(c *gin.Context) {
	body := common.BindJSON(c)
	if err := service.ResetPassword(common.PathID(c, "id"), service.Str(body["new_password"])); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "密码已重置")
}

// ---------- 角色管理 ----------

// RoleList GET /api/roles
func RoleList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListRoles(page, size, c.Query("keyword"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// RoleCreate POST /api/roles
func RoleCreate(c *gin.Context) {
	id, err := service.CreateRole(common.BindJSON(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": id}, "创建成功")
}

// RoleUpdate PUT /api/roles/:id
func RoleUpdate(c *gin.Context) {
	if err := service.UpdateRole(common.PathID(c, "id"), common.BindJSON(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "更新成功")
}

// RoleDelete DELETE /api/roles/:id
func RoleDelete(c *gin.Context) {
	if err := service.DeleteRole(common.PathID(c, "id")); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "删除成功")
}

// RoleAssignPermissions PUT /api/roles/:id/permissions
func RoleAssignPermissions(c *gin.Context) {
	body := common.BindJSON(c)
	ids, _ := body["permission_ids"].([]any)
	if err := service.AssignPermissions(common.PathID(c, "id"), ids); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "权限已更新")
}

// RoleAssignResources PUT /api/roles/:id/resources
func RoleAssignResources(c *gin.Context) {
	body := common.BindJSON(c)
	ids, _ := body["resource_ids"].([]any)
	if err := service.AssignResources(common.PathID(c, "id"), ids); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "资源已更新")
}

// ---------- 权限管理 ----------

// PermissionList GET /api/permissions
func PermissionList(c *gin.Context) {
	page, size := common.PageOf(c)
	p, err := service.ListPermissions(page, size, c.Query("keyword"))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, p, "")
}

// PermissionAll GET /api/permissions/all
func PermissionAll(c *gin.Context) {
	rows, err := service.ListAllPermissions()
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, rows, "")
}

// PermissionCreate POST /api/permissions
func PermissionCreate(c *gin.Context) {
	id, err := service.CreatePermission(common.BindJSON(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": id}, "创建成功")
}

// PermissionUpdate PUT /api/permissions/:id
func PermissionUpdate(c *gin.Context) {
	if err := service.UpdatePermission(common.PathID(c, "id"), common.BindJSON(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "更新成功")
}

// PermissionDelete DELETE /api/permissions/:id
func PermissionDelete(c *gin.Context) {
	if err := service.DeletePermission(common.PathID(c, "id")); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "删除成功")
}

// ---------- 资源管理 ----------

// ResourceTree GET /api/resources/tree
func ResourceTree(c *gin.Context) {
	tree, err := service.ResourceTree()
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, tree, "")
}

// ResourceList GET /api/resources
func ResourceList(c *gin.Context) {
	rows, err := service.ListResources()
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, rows, "")
}

// ResourceCreate POST /api/resources
func ResourceCreate(c *gin.Context) {
	id, err := service.CreateResource(common.BindJSON(c))
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": id}, "创建成功")
}

// ResourceUpdate PUT /api/resources/:id
func ResourceUpdate(c *gin.Context) {
	if err := service.UpdateResource(common.PathID(c, "id"), common.BindJSON(c)); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "更新成功")
}

// ResourceDelete DELETE /api/resources/:id
func ResourceDelete(c *gin.Context) {
	if err := service.DeleteResource(common.PathID(c, "id")); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, nil, "删除成功")
}
