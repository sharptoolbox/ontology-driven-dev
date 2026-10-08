package service

import (
	"encoding/json"
	"strings"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/ontology"
)

// GetRoleByCode 按编码取角色。
func GetRoleByCode(code string) (map[string]any, error) {
	return qOne(`SELECT * FROM sys_role WHERE code = ?`, code)
}

// SyncUserRolesByCodes 按角色编码全量同步用户角色(ZITADEL claim → 本地角色)。
// 仅映射本地已存在的角色;返回实际生效的本地角色编码。
func SyncUserRolesByCodes(userID int64, roleCodes []string) error {
	var roleIDs []any
	applied := map[string]bool{}
	for _, code := range roleCodes {
		code = strings.TrimSpace(code)
		if code == "" || applied[code] {
			continue
		}
		role, err := GetRoleByCode(code)
		if err != nil || role == nil {
			continue
		}
		applied[code] = true
		roleIDs = append(roleIDs, Int(role["id"]))
	}
	if len(roleIDs) == 0 {
		return nil
	}
	return SetUserRoles(userID, roleIDs)
}

// ---------- 种子数据(seed.py 对应) ----------

var seedRoles = []struct{ Code, Name, Desc string }{
	{"admin", "系统管理员", "系统内置超级管理员"},
	{"SALES", "业务人员", "客户申请提交人"},
	{"CUSTOMER_MANAGER", "客户经理", "客户审批第一节点"},
	{"DEPT_GENERAL_MANAGER", "部门总经理", "客户审批第二节点"},
}

var seedPermissions = []struct{ Code, Name, TargetType, TargetRef string }{
	{"customer:save", "客户申请暂存", "BEHAVIOR", "Customer_SaveAsDraft"},
	{"customer:submit", "客户申请提交", "BEHAVIOR", "Customer_Submit"},
	{"customer:query", "客户查询", "BEHAVIOR", "Customer_QueryList"},
	{"customer:approve-manager", "客户经理审批", "BEHAVIOR", "Customer_ApproveManager"},
	{"customer:approve-gm", "部门总经理审批", "BEHAVIOR", "Customer_ApproveGM"},
	{"system:user:add", "用户新增", "BEHAVIOR", "User_Add"},
	{"system:user:edit", "用户编辑", "BEHAVIOR", "User_Edit"},
	{"system:user:delete", "用户删除", "BEHAVIOR", "User_Delete"},
	{"system:user:assign-role", "分配角色", "BEHAVIOR", "User_AssignRole"},
	{"system:user:reset-pwd", "重置密码", "BEHAVIOR", "User_ResetPassword"},
	{"system:role:add", "角色新增", "BEHAVIOR", "Role_Add"},
	{"system:role:edit", "角色编辑", "BEHAVIOR", "Role_Edit"},
	{"system:role:delete", "角色删除", "BEHAVIOR", "Role_Delete"},
	{"system:role:assign", "分配权限资源", "BEHAVIOR", "Role_Assign"},
	{"system:permission:add", "权限新增", "BEHAVIOR", "Permission_Add"},
	{"system:permission:edit", "权限编辑", "BEHAVIOR", "Permission_Edit"},
	{"system:permission:delete", "权限删除", "BEHAVIOR", "Permission_Delete"},
	{"system:resource:add", "资源新增", "BEHAVIOR", "Resource_Add"},
	{"system:resource:edit", "资源编辑", "BEHAVIOR", "Resource_Edit"},
	{"system:resource:delete", "资源删除", "BEHAVIOR", "Resource_Delete"},
	{"flow:definition:add", "流程新增", "BEHAVIOR", "Flow_Add"},
	{"flow:definition:edit", "流程编辑", "BEHAVIOR", "Flow_Edit"},
	{"flow:definition:publish", "流程发布", "BEHAVIOR", "Flow_Publish"},
	{"flow:instance:terminate", "强制终止", "BEHAVIOR", "Flow_Terminate"},
	{"flow:task:transfer", "任务转办", "BEHAVIOR", "Flow_Transfer"},
	{"flow:task:urge", "任务催办", "BEHAVIOR", "Flow_Urge"},
}

var seedResources = []struct{ Parent, Name, Code, PermCode, Type, Path, Icon string; Sort int }{
	{"", "客户管理", "menu-customer", "", "DIRECTORY", "", "Users", 10},
	{"menu-customer", "客户申请", "menu-customer-apply", "customer:save", "MENU", "/customer/apply", "UserPlus", 11},
	{"menu-customer", "客户查询", "menu-customer-query", "customer:query", "MENU", "/customer/query", "Search", 12},
	{"", "审批中心", "menu-workbench", "", "DIRECTORY", "", "ClipboardList", 20},
	{"menu-workbench", "我的待办", "menu-workbench-todo", "", "MENU", "/workbench/todo", "Inbox", 21},
	{"menu-workbench", "我的已办", "menu-workbench-done", "", "MENU", "/workbench/done", "CheckSquare", 22},
	{"menu-workbench", "我的申请", "menu-workbench-requested", "", "MENU", "/workbench/requested", "FileText", 23},
	{"", "流程管理", "menu-flow", "", "DIRECTORY", "", "GitBranch", 30},
	{"menu-flow", "流程定义", "menu-flow-definition", "flow:manage", "MENU", "/flow/definitions", "Workflow", 31},
	{"menu-flow", "流程实例", "menu-flow-instance", "flow:manage", "MENU", "/flow/instances", "List", 32},
	{"menu-flow", "流程任务", "menu-flow-task", "flow:manage", "MENU", "/flow/tasks", "ListChecks", 33},
	{"", "系统管理", "menu-system", "", "DIRECTORY", "", "Settings", 40},
	{"menu-system", "用户管理", "menu-system-user", "system:manage", "MENU", "/system/users", "User", 41},
	{"menu-system", "角色管理", "menu-system-role", "system:manage", "MENU", "/system/roles", "Shield", 42},
	{"menu-system", "权限管理", "menu-system-permission", "system:manage", "MENU", "/system/permissions", "Key", 43},
	{"menu-system", "资源管理", "menu-system-resource", "system:manage", "MENU", "/system/resources", "Menu", 44},
}

var seedUsers = []struct{ Username, Password, RealName, RoleCode string }{
	{"admin", "admin123", "管理员", "admin"},
	{"sales", "123456", "王业务", "SALES"},
	{"cmanager", "123456", "张经理", "CUSTOMER_MANAGER"},
	{"gm", "123456", "李总", "DEPT_GENERAL_MANAGER"},
}

var seedRolePermissions = map[string][]string{
	"SALES":              {"customer:save", "customer:submit", "customer:query"},
	"CUSTOMER_MANAGER":   {"customer:approve-manager", "customer:query"},
	"DEPT_GENERAL_MANAGER": {"customer:approve-gm", "customer:query"},
}

// EnsureSeed 种子(幂等;users 非空则仅确保流程定义)。
func EnsureSeed() error {
	count, err := qCount(`SELECT COUNT(*) FROM sys_user`)
	if err != nil {
		return err
	}
	if count > 0 {
		return ensureFlowDefinitions()
	}
	// 角色
	roleIDs := map[string]int64{}
	for _, r := range seedRoles {
		if _, err := qExec(`INSERT INTO sys_role (name, code, parent_id, description, status) VALUES (?, ?, 0, ?, 1)`,
			r.Name, r.Code, r.Desc); err != nil {
			return err
		}
		row, err := qOne(`SELECT id FROM sys_role WHERE code = ?`, r.Code)
		if err != nil {
			return err
		}
		roleIDs[r.Code] = toInt(row["id"])
	}
	// 权限
	for _, p := range seedPermissions {
		if _, err := qExec(`
			INSERT INTO sys_permission (code, name, target_type, target_ref, data_scope, status)
			VALUES (?, ?, ?, ?, 'ALL', 1)`, p.Code, p.Name, p.TargetType, p.TargetRef); err != nil {
			return err
		}
	}
	perms, err := qList(`SELECT id, code FROM sys_permission`)
	if err != nil {
		return err
	}
	permIDByCode := map[string]any{}
	for _, p := range perms {
		permIDByCode[Str(p["code"])] = p["id"]
	}
	// 资源
	resIDs := map[string]int64{}
	for _, r := range seedResources {
		parentID := resIDs[r.Parent]
		if _, err := qExec(`
			INSERT INTO sys_resource (parent_id, name, code, permission_code, type, path, component, icon, sort_order, status)
			VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`,
			parentID, r.Name, r.Code, r.PermCode, r.Type, r.Path, r.Icon, r.Sort); err != nil {
			return err
		}
		row, err := qOne(`SELECT id FROM sys_resource WHERE code = ?`, r.Code)
		if err != nil {
			return err
		}
		resIDs[r.Code] = toInt(row["id"])
	}
	// 用户
	for _, u := range seedUsers {
		if _, err := qExec(`
			INSERT INTO sys_user (username, password, real_name, actor_type, status)
			VALUES (?, ?, ?, 'HUMAN', 1)`, u.Username, HashPassword(u.Password), u.RealName); err != nil {
			return err
		}
		row, err := qOne(`SELECT id FROM sys_user WHERE username = ?`, u.Username)
		if err != nil {
			return err
		}
		uid := toInt(row["id"])
		if _, err := qExec(`INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)`, uid, roleIDs[u.RoleCode]); err != nil {
			return err
		}
	}
	// 角色权限(admin 超管位由 GetPermissionCodes 代码层注入,不落数据)
	for roleCode, permCodes := range seedRolePermissions {
		roleID := roleIDs[roleCode]
		for _, pc := range permCodes {
			if _, err := qExec(`INSERT INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)`,
				roleID, permIDByCode[pc]); err != nil {
				return err
			}
		}
	}
	return ensureFlowDefinitions()
}

// ensureFlowDefinitions 从本体注册表 M6 流程定义导入(幂等)。
func ensureFlowDefinitions() error {
	reg := ontology.Load()
	for code, flow := range reg.Flows {
		if exists, err := qOne(`SELECT id FROM flow_definition WHERE code = ?`, code); err != nil {
			return err
		} else if exists != nil {
			continue
		}
		name, _ := flow["name"].(string)
		if name == "" {
			name = code
		}
		flowType, _ := flow["flowType"].(string)
		if flowType == "" {
			flowType = "APPROVAL"
		}
		triggerType := "MANUAL"
		triggerBehavior := ""
		if trigger, ok := flow["trigger"].(map[string]any); ok {
			if v, ok := trigger["triggerType"].(string); ok && v != "" {
				triggerType = v
			}
			if v, ok := trigger["behaviorRef"].(string); ok {
				triggerBehavior = v
			}
		}
		desc, _ := flow["description"].(string)
		nodeGraph := "null"
		if ng, ok := flow["nodeGraph"]; ok && ng != nil {
			raw, err := json.Marshal(ng)
			if err == nil {
				nodeGraph = string(raw)
			}
		}
		if _, err := qExec(`
			INSERT INTO flow_definition (code, name, flow_type, trigger_type, trigger_behavior, description, node_graph, version, status, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
			code, name, flowType, triggerType, triggerBehavior, desc, nodeGraph); err != nil {
			return err
		}
	}
	return nil
}
