package service

import (
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/infra"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service/engine"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

func nowCompact() string {
	t := time.Now()
	return t.Format("20060102150405") + fmt.Sprintf("%06d", t.Nanosecond()/1000)
}

// IsSuperAdmin 是否超管(权限码 "*")。
func IsSuperAdmin(userID int64) bool {
	codes, err := GetPermissionCodes(store.DB, userID)
	if err != nil {
		return false
	}
	for _, c := range codes {
		if c == "*" {
			return true
		}
	}
	return false
}

// ---------- 审批中心/工作台(workbench_service.py) ----------

func userRoleCodes(userID int64) []string {
	roles, err := GetUserRoles(store.DB, userID)
	if err != nil {
		return nil
	}
	codes := make([]string, 0, len(roles))
	for _, r := range roles {
		codes = append(codes, Str(r["code"]))
	}
	return codes
}

func placeholders(n int) string {
	out := ""
	for i := 0; i < n; i++ {
		if i > 0 {
			out += ","
		}
		out += "?"
	}
	return out
}

// WorkbenchTodo 我的待办(超管看全部)。
func WorkbenchTodo(userID int64, page, size int) (*Page, error) {
	where := "t.status='TODO'"
	var args []any
	if !IsSuperAdmin(userID) {
		roleCodes := userRoleCodes(userID)
		args = append(args, userID)
		if len(roleCodes) > 0 {
			// 组任务按角色匹配;个人任务按经办人
			where += " AND (t.assignee_id=? OR t.role_ref IN (" + placeholders(len(roleCodes)) + "))"
			for _, c := range roleCodes {
				args = append(args, c)
			}
		} else {
			// 无角色用户只看个人任务(避免拼出 IN () 语法错误)
			where += " AND t.assignee_id=?"
		}
	}
	total, err := qCount(`SELECT COUNT(*) FROM flow_task t WHERE `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`
		SELECT t.*, i.business_key, i.creator_id, i.started_at,
		       c.customer_name, c.customer_no, c.applicant_name
		FROM flow_task t
		JOIN flow_instance i ON i.id = t.instance_id
		LEFT JOIN customer_application c ON c.instance_id = i.id
		WHERE `+where+` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// WorkbenchDone 我的已办。
func WorkbenchDone(userID int64, page, size int) (*Page, error) {
	where := "t.status IN ('DONE','CANCEL')"
	var args []any
	if !IsSuperAdmin(userID) {
		roleCodes := userRoleCodes(userID)
		args = append(args, userID)
		if len(roleCodes) > 0 {
			where += " AND (t.assignee_id=? OR t.role_ref IN (" + placeholders(len(roleCodes)) + "))"
			for _, c := range roleCodes {
				args = append(args, c)
			}
		} else {
			where += " AND t.assignee_id=?"
		}
	}
	total, err := qCount(`SELECT COUNT(*) FROM flow_task t WHERE `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`
		SELECT t.*, i.business_key, c.customer_name, c.customer_no
		FROM flow_task t
		JOIN flow_instance i ON i.id = t.instance_id
		LEFT JOIN customer_application c ON c.instance_id = i.id
		WHERE `+where+` ORDER BY t.done_at DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// WorkbenchRequested 我的申请。
func WorkbenchRequested(userID int64, page, size int) (*Page, error) {
	total, err := qCount(`SELECT COUNT(*) FROM customer_application WHERE applicant_id=?`, userID)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`
		SELECT c.*, i.status AS flow_status
		FROM customer_application c
		LEFT JOIN flow_instance i ON i.id = c.instance_id
		WHERE c.applicant_id=?
		ORDER BY c.id DESC LIMIT ? OFFSET ?`, userID, size, (page-1)*size)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// loadTaskAndCheck 载入任务并校验归属(超管/被指派人/角色匹配)。
func loadTaskAndCheck(taskID int64, user UserInfo) (map[string]any, error) {
	task, err := qOne(`SELECT * FROM flow_task WHERE id = ?`, taskID)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, NotFound("任务")
	}
	if task["status"] != "TODO" {
		return nil, Fail(errcode.ErrFlowState, "任务已处理，不能重复操作")
	}
	if IsSuperAdmin(user.ID) {
		return task, nil
	}
	if toInt(task["assignee_id"]) == user.ID {
		return task, nil
	}
	roleCodes := userRoleCodes(user.ID)
	roleRef := Str(task["role_ref"])
	for _, c := range roleCodes {
		if roleRef != "" && c == roleRef {
			return task, nil
		}
	}
	return nil, Fail(errcode.ErrTaskNotOwner, "该任务不属于当前用户")
}

func doTaskAction(taskID int64, user UserInfo, action, comment, targetActivityID string, act func(db *gorm.DB, eng *engine.Engine, task map[string]any) (any, error)) (any, error) {
	var out any
	err := tx(func(db *gorm.DB) error {
		// 在事务内重新载入并校验(行级一致性)
		task, err := store.One(db, `SELECT * FROM flow_task WHERE id = ?`, taskID)
		if err != nil {
			return err
		}
		if task == nil {
			return NotFound("任务")
		}
		if task["status"] != "TODO" {
			return Fail(errcode.ErrFlowState, "任务已处理，不能重复操作")
		}
		// 校验归属(与 loadTaskAndCheck 相同口径,但用事务连接)
		if !IsSuperAdmin(user.ID) {
			ok := false
			if toInt(task["assignee_id"]) == user.ID {
				ok = true
			} else {
				roles, err := GetUserRoles(db, user.ID)
				if err != nil {
					return err
				}
				roleRef := Str(task["role_ref"])
				for _, r := range roles {
					if Str(r["code"]) == roleRef && roleRef != "" {
						ok = true
						break
					}
				}
			}
			if !ok {
				return Fail(errcode.ErrTaskNotOwner, "该任务不属于当前用户")
			}
		}
		eng := engine.NewWithInfra(db, infra.EB(), infra.WF(), infra.SLAHours(), infra.TemporalDriver())
		_ = action
		_ = comment
		_ = targetActivityID
		out, err = act(db, eng, task)
		return err
	})
	return out, err
}

// ApproveTask 审批通过。
func ApproveTask(taskID int64, comment string, user UserInfo) (any, error) {
	return doTaskAction(taskID, user, "APPROVE", comment, "", func(db *gorm.DB, eng *engine.Engine, task map[string]any) (any, error) {
		if _, err := eng.Approve(toInt(task["id"]), comment, user.ID, user.Username); err != nil {
			return nil, err
		}
		if _, err := SyncCustomerStatusFromInstance(db, toInt(task["instance_id"])); err != nil {
			return nil, err
		}
		return toInt(task["instance_id"]), nil
	})
}

// RejectTask 审批驳回。
func RejectTask(taskID int64, comment string, user UserInfo) (any, error) {
	return doTaskAction(taskID, user, "REJECT", comment, "", func(db *gorm.DB, eng *engine.Engine, task map[string]any) (any, error) {
		if _, err := eng.Reject(toInt(task["id"]), comment, user.ID, user.Username); err != nil {
			return nil, err
		}
		if _, err := SyncCustomerStatusFromInstance(db, toInt(task["instance_id"])); err != nil {
			return nil, err
		}
		return toInt(task["instance_id"]), nil
	})
}

// ReturnTask 退回指定节点(空则退回第一个审批节点)。
func ReturnTask(taskID int64, targetActivityID, comment string, user UserInfo) (any, error) {
	return doTaskAction(taskID, user, "RETURN", comment, targetActivityID, func(db *gorm.DB, eng *engine.Engine, task map[string]any) (any, error) {
		if targetActivityID == "" {
			first, err := firstApprovalNode(db, toInt(task["instance_id"]))
			if err != nil {
				return nil, err
			}
			targetActivityID = first
		}
		if _, err := eng.ReturnTo(toInt(task["id"]), targetActivityID, comment, user.ID, user.Username); err != nil {
			return nil, err
		}
		if _, err := SyncCustomerStatusFromInstance(db, toInt(task["instance_id"])); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

// firstApprovalNode 开始节点的第一个后继。
func firstApprovalNode(db *gorm.DB, instanceID int64) (string, error) {
	inst, err := store.One(db, `SELECT * FROM flow_instance WHERE id = ?`, instanceID)
	if err != nil || inst == nil {
		return "", err
	}
	definition, err := store.One(db, `SELECT * FROM flow_definition WHERE id = ?`, toInt(inst["def_id"]))
	if err != nil || definition == nil {
		return "", err
	}
	graph, _ := ParseJSONText(Str(definition["node_graph"]), map[string]any{}).(map[string]any)
	var startID string
	if nodes, ok := graph["nodes"].([]any); ok {
		for _, n := range nodes {
			nm, _ := n.(map[string]any)
			if nm != nil && nm["type"] == "start" {
				startID, _ = nm["id"].(string)
				break
			}
		}
	}
	if startID == "" {
		return "", nil
	}
	if edges, ok := graph["edges"].([]any); ok {
		for _, ed := range edges {
			em, _ := ed.(map[string]any)
			if em != nil && Str(em["source"]) == startID {
				return Str(em["target"]), nil
			}
		}
	}
	return "", nil
}
