package service

import (
	"encoding/json"
	"reflect"

	"gorm.io/gorm"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

// ---------- 认证与登录载荷(auth_service.py 对应) ----------

// GetUserByUsername 按用户名取用户。
func GetUserByUsername(username string) (map[string]any, error) {
	return qOne(`SELECT * FROM sys_user WHERE username = ?`, username)
}

// GetUser 按ID取用户。
func GetUser(id int64) (map[string]any, error) {
	return qOne(`SELECT * FROM sys_user WHERE id = ?`, id)
}

// VerifyPassword 校验密码(bcrypt)。
func VerifyPassword(raw string, hashed string) bool {
	return checkPassword(raw, hashed)
}

// Login 用户名密码登录(local 模式)。
func Login(username, password string) (map[string]any, string) {
	user, err := GetUserByUsername(username)
	if err != nil || user == nil || !VerifyPassword(password, Str(user["password"])) {
		return nil, "用户名或密码错误"
	}
	if Int(user["status"]) != 1 {
		return nil, "账号已被禁用"
	}
	return user, ""
}

// GetUserRoles 取用户生效角色(沿 parent 向上聚合,与 Python 口径一致)。
func GetUserRoles(db *gorm.DB, userID int64) ([]map[string]any, error) {
	rows, err := store.List(db, `
		SELECT r.* FROM sys_role r
		JOIN sys_user_role ur ON ur.role_id = r.id
		WHERE ur.user_id = ? AND r.status = 1`, userID)
	if err != nil {
		return nil, err
	}
	var result []map[string]any
	seen := map[int64]bool{}
	stack := append([]map[string]any{}, rows...)
	for len(stack) > 0 {
		role := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		id := Int(role["id"])
		if seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, role)
		if pid := Int(role["parent_id"]); pid != 0 {
			parent, err := store.One(db, `SELECT * FROM sys_role WHERE id = ?`, pid)
			if err == nil && parent != nil && Int(parent["status"]) == 1 && !seen[Int(parent["id"])] {
				stack = append(stack, parent)
			}
		}
	}
	if result == nil {
		result = []map[string]any{}
	}
	return result, nil
}

// GetPermissionCodes 取用户全部权限码(角色沿父级聚合;"*" 为超管)。
func GetPermissionCodes(db *gorm.DB, userID int64) ([]string, error) {
	roles, err := GetUserRoles(db, userID)
	if err != nil {
		return nil, err
	}
	if len(roles) == 0 {
		return []string{}, nil
	}
	codes := map[string]bool{}
	for _, r := range roles {
		// admin 内置超管位(与 Python 口径一致:角色码 admin/ROLE-ADMIN → "*")
		if rc := Str(r["code"]); rc == "admin" || rc == "ROLE-ADMIN" {
			codes["*"] = true
		}
		perms, err := store.List(db, `
			SELECT p.code FROM sys_permission p
			JOIN sys_role_permission rp ON rp.permission_id = p.id
			WHERE rp.role_id = ? AND p.status = 1`, Int(r["id"]))
		if err != nil {
			return nil, err
		}
		for _, p := range perms {
			codes[Str(p["code"])] = true
		}
	}
	out := make([]string, 0, len(codes))
	for c := range codes {
		out = append(out, c)
	}
	// 排序保证稳定输出
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

// HasPermission 判断用户是否持有权限码。
func HasPermission(db *gorm.DB, userID int64, code string) (bool, error) {
	codes, err := GetPermissionCodes(db, userID)
	if err != nil {
		return false, err
	}
	for _, c := range codes {
		if c == "*" || c == code {
			return true, nil
		}
	}
	return false, nil
}

// GetMenus 取用户可见菜单(DIRECTORY 聚合可见 MENU 子项)。
func GetMenus(db *gorm.DB, userID int64) ([]map[string]any, error) {
	codes, err := GetPermissionCodes(db, userID)
	if err != nil {
		return nil, err
	}
	codeSet := map[string]bool{}
	for _, c := range codes {
		codeSet[c] = true
	}
	isSuper := codeSet["*"]
	resources, err := store.List(db, `
		SELECT * FROM sys_resource WHERE status = 1 AND type IN ('DIRECTORY','MENU')
		ORDER BY sort_order, id`)
	if err != nil {
		return nil, err
	}
	allowed := map[int64]bool{}
	for _, r := range resources {
		if Str(r["type"]) == "MENU" {
			pc := Str(r["permission_code"])
			if pc == "" || isSuper || codeSet[pc] {
				allowed[Int(r["id"])] = true
			}
		}
	}
	var menus []map[string]any
	for _, dir := range resources {
		if Str(dir["type"]) != "DIRECTORY" {
			continue
		}
		var children []map[string]any
		for _, c := range resources {
			if Int(c["parent_id"]) == Int(dir["id"]) && allowed[Int(c["id"])] {
				children = append(children, map[string]any{
					"id":              Int(c["id"]),
					"name":            c["name"],
					"code":            c["code"],
					"icon":            c["icon"],
					"path":            c["path"],
					"permission_code": c["permission_code"],
				})
			}
		}
		if len(children) > 0 {
			if children == nil {
				children = []map[string]any{}
			}
			menus = append(menus, map[string]any{
				"id":       Int(dir["id"]),
				"name":     dir["name"],
				"code":     dir["code"],
				"icon":     dir["icon"],
				"path":     dir["path"],
				"children": children,
			})
		}
	}
	if menus == nil {
		menus = []map[string]any{}
	}
	return menus, nil
}

// BuildLoginPayload 构建登录载荷(user/permissions/menus)。
func BuildLoginPayload(db *gorm.DB, user map[string]any) (map[string]any, error) {
	uid := Int(user["id"])
	roles, err := GetUserRoles(db, uid)
	if err != nil {
		return nil, err
	}
	roleCodes := make([]string, 0, len(roles))
	for _, r := range roles {
		roleCodes = append(roleCodes, Str(r["code"]))
	}
	perms, err := GetPermissionCodes(db, uid)
	if err != nil {
		return nil, err
	}
	menus, err := GetMenus(db, uid)
	if err != nil {
		return nil, err
	}
	realName := Str(user["real_name"])
	if realName == "" {
		realName = Str(user["username"])
	}
	return map[string]any{
		"user": map[string]any{
			"id":         uid,
			"username":   user["username"],
			"real_name":  realName,
			"actor_type": user["actor_type"],
			"roles":      roleCodes,
		},
		"permissions": perms,
		"menus":       menus,
	}, nil
}

// WriteAudit 写审计日志。
func WriteAudit(db *gorm.DB, userID int64, username, action, detail string) {
	_, _ = store.Exec(db, `
		INSERT INTO audit_logs (user_id, username, action, detail) VALUES (?, ?, ?, ?)`,
		userID, username, action, detail)
}

// ---------- 类型助手 ----------

// Int any→int64(JSON 数字为 float64;PG smallint/int/bigint 均适配)。
func Int(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case json.Number:
		f, _ := x.Float64()
		return int64(f)
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return rv.Int()
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return int64(rv.Uint())
	case reflect.Float32, reflect.Float64:
		return int64(rv.Float())
	}
	return 0
}

// Str any→string。
func Str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// MarshalJSONVal any→JSON 文本(存储用)。
func MarshalJSONVal(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

// ParseJSONText JSON 文本→any(空按 default)。
func ParseJSONText(raw string, def any) any {
	if raw == "" {
		return def
	}
	var v any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return def
	}
	return v
}

// ErrDuplicate 已存在类错误的统一提示。
func DupErr(what string) *BizErr {
	return Fail(errcode.ErrDuplicate, "%s已存在", what)
}

// NotFound 不存在。
func NotFound(what string) *BizErr {
	return Fail(errcode.ErrNotFound, "%s不存在", what)
}
