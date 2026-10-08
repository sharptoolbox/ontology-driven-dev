package service

import (
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
	"golang.org/x/crypto/bcrypt"
)

// checkPassword bcrypt 校验。
func checkPassword(raw, hashed string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(raw)) == nil
}

// HashPassword bcrypt 散列(Python werkzeug generate_password_hash 对应)。
func HashPassword(raw string) string {
	out, _ := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.DefaultCost)
	return string(out)
}

// ---------- 用户管理(user_service.py) ----------

// ListUsers 用户列表。
func ListUsers(page, size int, keyword string) (*Page, error) {
	where := ""
	args := []any{}
	if keyword != "" {
		where = "WHERE username LIKE ? OR phone LIKE ? OR real_name LIKE ?"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw, kw)
	}
	total, err := qCount(`SELECT COUNT(*) FROM sys_user `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`SELECT * FROM sys_user `+where+` ORDER BY id LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	users := make([]map[string]any, 0, len(rows))
	for _, u := range rows {
		roles, err := RolesOfUser(nil, Int(u["id"]))
		if err != nil {
			return nil, err
		}
		u["roles"] = roles
		delete(u, "password")
		users = append(users, u)
	}
	return &Page{List: users, Total: total, PageV: page, Size: size}, nil
}

// RolesOfUser 用户角色(id/name/code)。
func RolesOfUser(db any, userID int64) ([]map[string]any, error) {
	return qList(`
		SELECT r.id, r.name, r.code FROM sys_role r
		JOIN sys_user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?`, userID)
}

// GetUserInfo 用户详情(含角色,去除密码)。
func GetUserInfo(userID int64) (map[string]any, error) {
	u, err := qOne(`SELECT * FROM sys_user WHERE id = ?`, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, NotFound("用户")
	}
	roles, err := RolesOfUser(nil, Int(u["id"]))
	if err != nil {
		return nil, err
	}
	u["roles"] = roles
	delete(u, "password")
	return u, nil
}

// CreateUser 新建用户。
func CreateUser(data map[string]any) (int64, error) {
	username := Str(data["username"])
	if username == "" {
		return 0, Fail(errcode.ErrParam, "用户名必填")
	}
	if exists, err := qOne(`SELECT id FROM sys_user WHERE username = ?`, username); err != nil {
		return 0, err
	} else if exists != nil {
		return 0, DupErr("用户名")
	}
	pwd := Str(data["password"])
	if pwd == "" {
		pwd = "123456"
	}
	actorType := Str(data["actor_type"])
	if actorType == "" {
		actorType = "HUMAN"
	}
	status := int64(1)
	if v, ok := data["status"].(float64); ok {
		status = int64(v)
	}
	n, err := qExec(`
		INSERT INTO sys_user (username, password, real_name, email, phone, actor_type, department_id, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		username, HashPassword(pwd), data["real_name"], data["email"], data["phone"],
		actorType, data["department_id"], status)
	if err != nil {
		return 0, err
	}
	uid, err := qOne(`SELECT id FROM sys_user WHERE username = ?`, username)
	if err != nil {
		return 0, err
	}
	if roleIDs, ok := data["role_ids"].([]any); ok && len(roleIDs) > 0 {
		if err := SetUserRoles(Int(uid["id"]), roleIDs); err != nil {
			return 0, err
		}
	}
	_ = n
	return Int(uid["id"]), nil
}

// UpdateUser 编辑用户。
func UpdateUser(userID int64, data map[string]any) error {
	if exists, err := qOne(`SELECT id FROM sys_user WHERE id = ?`, userID); err != nil {
		return err
	} else if exists == nil {
		return NotFound("用户")
	}
	_, err := qExec(`
		UPDATE sys_user SET real_name=?, email=?, phone=?, actor_type=?, department_id=?, status=?, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS')
		WHERE id=?`,
		data["real_name"], data["email"], data["phone"],
		orDefault(data["actor_type"], "HUMAN"), data["department_id"],
		orDefaultNum(data["status"], 1), userID)
	return err
}

// DeleteUser 删除用户(级联清理关联)。
func DeleteUser(userID int64) error {
	if exists, err := qOne(`SELECT id FROM sys_user WHERE id = ?`, userID); err != nil {
		return err
	} else if exists == nil {
		return NotFound("用户")
	}
	if _, err := qExec(`DELETE FROM sys_user_role WHERE user_id = ?`, userID); err != nil {
		return err
	}
	_, err := qExec(`DELETE FROM sys_user WHERE id = ?`, userID)
	return err
}

// AssignRoles 分配角色(全量替换)。
func AssignRoles(userID int64, roleIDs []any) error {
	return SetUserRoles(userID, roleIDs)
}

// SetUserRoles 全量替换用户角色。
func SetUserRoles(userID int64, roleIDs []any) error {
	if _, err := qExec(`DELETE FROM sys_user_role WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, rid := range roleIDs {
		if _, err := qExec(`INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)`, userID, rid); err != nil {
			return err
		}
	}
	return nil
}

// ResetPassword 重置密码。
func ResetPassword(userID int64, newPwd string) error {
	if newPwd == "" {
		return Fail(errcode.ErrParam, "新密码不能为空")
	}
	_, err := qExec(`UPDATE sys_user SET password=?, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
		HashPassword(newPwd), userID)
	return err
}

// ListRoleOptions 角色下拉选项。
func ListRoleOptions() ([]map[string]any, error) {
	rows, err := qList(`SELECT id, name, code FROM sys_role WHERE status = 1 ORDER BY id`)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return rows, nil
}

func orDefault(v any, def any) any {
	if v == nil {
		return def
	}
	return v
}

func orDefaultNum(v any, def int64) any {
	if v == nil {
		return def
	}
	return v
}
