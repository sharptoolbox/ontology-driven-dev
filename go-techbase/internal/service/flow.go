package service

import (
	"encoding/json"

	"gorm.io/gorm"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/infra"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service/engine"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
)

// ---------- 流程管理(flow_service.py) ----------

// ListDefinitions 流程定义列表。
func ListDefinitions(page, size int, keyword string) (*Page, error) {
	where := ""
	args := []any{}
	if keyword != "" {
		where = "WHERE name LIKE ? OR code LIKE ?"
		kw := "%" + keyword + "%"
		args = append(args, kw, kw)
	}
	total, err := qCount(`SELECT COUNT(*) FROM flow_definition `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`SELECT * FROM flow_definition `+where+` ORDER BY id DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// GetDefinition 流程定义详情(node_graph 解析为对象)。
func GetDefinition(defID int64) (map[string]any, error) {
	row, err := qOne(`SELECT * FROM flow_definition WHERE id = ?`, defID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, NotFound("流程定义")
	}
	row["node_graph"] = ParseJSONText(Str(row["node_graph"]), map[string]any{})
	return row, nil
}

// GetDefinitionGraph 流程图。
func GetDefinitionGraph(defID int64) (any, error) {
	row, err := qOne(`SELECT node_graph FROM flow_definition WHERE id = ?`, defID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, NotFound("流程定义")
	}
	return ParseJSONText(Str(row["node_graph"]), map[string]any{}), nil
}

// CreateDefinition 新建流程定义。
func CreateDefinition(data map[string]any, userID int64) (int64, error) {
	code := Str(data["code"])
	if code == "" {
		return 0, Fail(errcode.ErrParam, "流程编码必填")
	}
	if exists, err := qOne(`SELECT id FROM flow_definition WHERE code = ?`, code); err != nil {
		return 0, err
	} else if exists != nil {
		return 0, DupErr("流程编码")
	}
	nodeGraph := data["node_graph"]
	if nodeGraph == nil {
		nodeGraph = map[string]any{"nodes": []any{}, "edges": []any{}}
	}
	flowType := Str(data["flow_type"])
	if flowType == "" {
		flowType = "APPROVAL"
	}
	triggerType := Str(data["trigger_type"])
	if triggerType == "" {
		triggerType = "MANUAL"
	}
	if _, err := qExec(`
		INSERT INTO flow_definition (code, name, flow_type, trigger_type, trigger_behavior, description, node_graph, version, status, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
		code, data["name"], flowType, triggerType, data["trigger_behavior"], data["description"],
		MarshalJSONVal(nodeGraph), userID); err != nil {
		return 0, err
	}
	created, err := qOne(`SELECT id FROM flow_definition WHERE code = ?`, code)
	if err != nil {
		return 0, err
	}
	return toInt(created["id"]), nil
}

// UpdateDefinition 编辑流程定义(已发布不可改)。
func UpdateDefinition(defID int64, data map[string]any) error {
	existing, err := qOne(`SELECT * FROM flow_definition WHERE id = ?`, defID)
	if err != nil {
		return err
	}
	if existing == nil {
		return NotFound("流程定义")
	}
	if toInt(existing["status"]) == 1 {
		return Fail(errcode.ErrState, "已发布流程不可直接编辑，请停用后修改或新建版本")
	}
	nodeGraph := data["node_graph"]
	if nodeGraph == nil {
		nodeGraph = ParseJSONText(Str(existing["node_graph"]), map[string]any{})
	}
	pick := func(key string) any {
		if v, ok := data[key]; ok && v != nil {
			return v
		}
		return existing[key]
	}
	_, err = qExec(`
		UPDATE flow_definition SET name=?, flow_type=?, trigger_type=?, trigger_behavior=?, description=?, node_graph=?,
		updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS')
		WHERE id=?`,
		pick("name"), pick("flow_type"), pick("trigger_type"), pick("trigger_behavior"),
		pick("description"), MarshalJSONVal(nodeGraph), defID)
	return err
}

// PublishDefinition 发布(含图校验)。
func PublishDefinition(defID int64) error {
	existing, err := qOne(`SELECT * FROM flow_definition WHERE id = ?`, defID)
	if err != nil {
		return err
	}
	if existing == nil {
		return NotFound("流程定义")
	}
	graph, _ := ParseJSONText(Str(existing["node_graph"]), map[string]any{}).(map[string]any)
	if err := ValidateGraph(graph); err != nil {
		return err
	}
	_, err = qExec(`UPDATE flow_definition SET status = 1, updated_at = to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, defID)
	return err
}

// ValidateGraph 校验流程图(开始唯一/结束至少一/审批节点须配角色)。
func ValidateGraph(graph map[string]any) error {
	nodes, _ := graph["nodes"].([]any)
	startCount, endCount := 0, 0
	for _, n := range nodes {
		nm, ok := n.(map[string]any)
		if !ok {
			continue
		}
		switch nm["type"] {
		case "start":
			startCount++
		case "end":
			endCount++
		case "approval_task", "user_task":
			if Str(nm["role_ref"]) == "" {
				return Fail(errcode.ErrGraph, "节点「%v」必须配置角色 role_ref", nm["name"])
			}
		}
	}
	if startCount != 1 {
		return Fail(errcode.ErrGraph, "流程必须包含且仅包含一个开始节点")
	}
	if endCount < 1 {
		return Fail(errcode.ErrGraph, "流程必须包含至少一个结束节点")
	}
	return nil
}

// ListInstances 实例列表。
func ListInstances(page, size int, filters map[string]any) (*Page, error) {
	where := "WHERE 1=1"
	args := []any{}
	if status := Str(filters["status"]); status != "" {
		where += " AND i.status = ?"
		args = append(args, status)
	}
	if kw := Str(filters["keyword"]); kw != "" {
		where += " AND (i.business_key LIKE ?)"
		args = append(args, "%"+kw+"%")
	}
	total, err := qCount(`SELECT COUNT(*) FROM flow_instance i JOIN flow_definition d ON d.id = i.def_id `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`
		SELECT i.*, d.name AS def_name, d.code AS def_code
		FROM flow_instance i JOIN flow_definition d ON d.id = i.def_id
		`+where+` ORDER BY i.id DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// GetInstanceDetail 实例详情(含 definition/tasks/history)。
func GetInstanceDetail(instanceID int64) (map[string]any, error) {
	inst, err := qOne(`SELECT * FROM flow_instance WHERE id = ?`, instanceID)
	if err != nil {
		return nil, err
	}
	if inst == nil {
		return nil, NotFound("流程实例")
	}
	definition, err := qOne(`SELECT * FROM flow_definition WHERE id = ?`, toInt(inst["def_id"]))
	if err != nil {
		return nil, err
	}
	tasks, err := qList(`SELECT * FROM flow_task WHERE instance_id = ? ORDER BY id`, instanceID)
	if err != nil {
		return nil, err
	}
	history, err := qList(`SELECT * FROM flow_history WHERE instance_id = ? ORDER BY id`, instanceID)
	if err != nil {
		return nil, err
	}
	inst["definition"] = map[string]any{
		"id":         definition["id"],
		"name":       definition["name"],
		"code":       definition["code"],
		"node_graph": ParseJSONText(Str(definition["node_graph"]), map[string]any{}),
	}
	if tasks == nil {
		tasks = []map[string]any{}
	}
	if history == nil {
		history = []map[string]any{}
	}
	inst["tasks"] = tasks
	inst["history"] = history
	return inst, nil
}

// TerminateInstance 终止实例。
func TerminateInstance(instanceID int64, user UserInfo) error {
	inst, err := qOne(`SELECT * FROM flow_instance WHERE id = ?`, instanceID)
	if err != nil {
		return err
	}
	if inst == nil {
		return NotFound("流程实例")
	}
	if inst["status"] != "RUNNING" {
		return Fail(errcode.ErrState, "仅运行中的实例可终止")
	}
	return tx(func(db *gorm.DB) error {
		if _, err := txExec(db, `
			UPDATE flow_instance SET status = 'TERMINATED', ended_at = to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`, instanceID); err != nil {
			return err
		}
		if _, err := txExec(db, `UPDATE flow_task SET status = 'CANCEL' WHERE instance_id = ? AND status = 'TODO'`, instanceID); err != nil {
			return err
		}
		_, err := txExec(db, `
			INSERT INTO flow_history (instance_id, operator_id, operator_name, action, comment) VALUES (?, ?, ?, 'TERMINATE', ?)`,
			instanceID, user.ID, user.Username, "强制终止")
		return err
	})
}

// ListTasks 任务列表。
func ListTasks(page, size int, filters map[string]any) (*Page, error) {
	where := "WHERE 1=1"
	args := []any{}
	if status := Str(filters["status"]); status != "" {
		where += " AND t.status = ?"
		args = append(args, status)
	}
	total, err := qCount(`SELECT COUNT(*) FROM flow_task t `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`
		SELECT t.*, i.business_key, d.name AS def_name
		FROM flow_task t
		JOIN flow_instance i ON i.id = t.instance_id
		JOIN flow_definition d ON d.id = i.def_id
		`+where+` ORDER BY t.id DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// TransferTask 转办。
func TransferTask(taskID int64, assigneeID int64) error {
	task, err := qOne(`SELECT * FROM flow_task WHERE id = ?`, taskID)
	if err != nil {
		return err
	}
	if task == nil {
		return NotFound("任务")
	}
	if task["status"] != "TODO" {
		return Fail(errcode.ErrFlowState, "仅待办任务可转办")
	}
	if assigneeID <= 0 {
		return Fail(errcode.ErrParam, "被转办人必填")
	}
	assignee, err := qOne(`SELECT id, real_name, username FROM sys_user WHERE id = ?`, assigneeID)
	if err != nil {
		return err
	}
	if assignee == nil {
		return NotFound("被转办用户")
	}
	name := Str(assignee["real_name"])
	if name == "" {
		name = Str(assignee["username"])
	}
	_, err = qExec(`
		UPDATE flow_task SET assignee_id=?, assignee_name=?, claimed_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
		assigneeID, name, taskID)
	return err
}

// UrgeTask 催办(写历史记录)。
func UrgeTask(taskID int64, user UserInfo) error {
	task, err := qOne(`SELECT * FROM flow_task WHERE id = ?`, taskID)
	if err != nil {
		return err
	}
	if task == nil {
		return NotFound("任务")
	}
	if task["status"] != "TODO" {
		return Fail(errcode.ErrState, "仅待办任务可催办")
	}
	_, err = qExec(`
		INSERT INTO flow_history (instance_id, activity_id, activity_name, operator_id, operator_name, action, comment)
		VALUES (?, ?, ?, ?, ?, 'URGE', ?)`,
		task["instance_id"], task["activity_id"], task["activity_name"], user.ID, user.Username, "催办提醒")
	return err
}

func toInt(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	}
	return 0
}

// ---------- 客户申请(customer_service.py) ----------

const flowCustomerCode = "FLOW-CUSTOMER-APPROVAL"

var roleStatusMap = map[string]string{
	"CUSTOMER_MANAGER":     "待客户经理审批",
	"DEPT_GENERAL_MANAGER": "待部门总经理审批",
}

var customerRequired = []string{"customer_name", "customer_type", "customer_level"}

func validateCustomer(data map[string]any) error {
	for _, f := range customerRequired {
		if Str(data[f]) == "" {
			return Fail(errcode.ErrParam, "客户名称、客户类型、客户等级为必填项")
		}
	}
	return nil
}

func genCustomerNo() string {
	return "CUS" + nowCompact()
}

// ListCustomers 客户列表。
func ListCustomers(page, size int, filters map[string]any) (*Page, error) {
	where := "WHERE 1=1"
	args := []any{}
	if v := Str(filters["customer_no"]); v != "" {
		where += " AND customer_no LIKE ?"
		args = append(args, "%"+v+"%")
	}
	if v := Str(filters["customer_name"]); v != "" {
		where += " AND customer_name LIKE ?"
		args = append(args, "%"+v+"%")
	}
	if v := Str(filters["status"]); v != "" {
		where += " AND status = ?"
		args = append(args, v)
	}
	total, err := qCount(`SELECT COUNT(*) FROM customer_application `+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := qList(`SELECT * FROM customer_application `+where+` ORDER BY id DESC LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return &Page{List: rows, Total: total, PageV: page, Size: size}, nil
}

// GetCustomer 客户详情。
func GetCustomer(customerID int64) (map[string]any, error) {
	row, err := qOne(`SELECT * FROM customer_application WHERE id = ?`, customerID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, NotFound("客户申请")
	}
	return row, nil
}

// CreateCustomerDraft 暂存草稿。
func CreateCustomerDraft(data map[string]any, user UserInfo) (map[string]any, error) {
	if err := validateCustomer(data); err != nil {
		return nil, err
	}
	customerNo := Str(data["customer_no"])
	if customerNo == "" {
		customerNo = genCustomerNo()
	}
	if exists, err := qOne(`SELECT id FROM customer_application WHERE customer_no = ?`, customerNo); err != nil {
		return nil, err
	} else if exists != nil {
		return nil, DupErr("客户编号")
	}
	realName := user.Username
	if rn := Str(data["applicant_name"]); rn != "" {
		realName = rn
	}
	if _, err := qExec(`
		INSERT INTO customer_application
			(customer_no, customer_name, customer_type, industry, contact_person, contact_phone,
			 customer_level, address, remark, status, applicant_id, applicant_name)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '草稿', ?, ?)`,
		customerNo, data["customer_name"], data["customer_type"], data["industry"],
		data["contact_person"], data["contact_phone"], data["customer_level"],
		data["address"], data["remark"], user.ID, realName); err != nil {
		return nil, err
	}
	created, err := qOne(`SELECT id FROM customer_application WHERE customer_no = ?`, customerNo)
	if err != nil {
		return nil, err
	}
	return GetCustomer(toInt(created["id"]))
}

// UpdateCustomerDraft 修改草稿(仅草稿/已驳回)。
func UpdateCustomerDraft(customerID int64, data map[string]any, user UserInfo) (map[string]any, error) {
	customer, err := GetCustomer(customerID)
	if err != nil {
		return nil, err
	}
	status := Str(customer["status"])
	if status != "草稿" && status != "已驳回" {
		return nil, Fail(errcode.ErrState, "仅草稿或已驳回状态可修改")
	}
	if err := validateCustomer(data); err != nil {
		return nil, err
	}
	if _, err := qExec(`
		UPDATE customer_application SET customer_name=?, customer_type=?, industry=?, contact_person=?,
			contact_phone=?, customer_level=?, address=?, remark=?, status='草稿',
			updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS')
		WHERE id=?`,
		data["customer_name"], data["customer_type"], data["industry"], data["contact_person"],
		data["contact_phone"], data["customer_level"], data["address"], data["remark"], customerID); err != nil {
		return nil, err
	}
	return GetCustomer(customerID)
}

// SubmitCustomer 提交(启动审批流)。
func SubmitCustomer(customerID int64, user UserInfo) (map[string]any, error) {
	customer, err := GetCustomer(customerID)
	if err != nil {
		return nil, err
	}
	status := Str(customer["status"])
	if status != "草稿" && status != "已驳回" {
		return nil, Fail(errcode.ErrState, "当前状态不可提交")
	}
	if err := validateCustomer(customer); err != nil {
		return nil, err
	}
	var instanceID int64
	err = tx(func(db *gorm.DB) error {
		definition, err := store.One(db, `SELECT * FROM flow_definition WHERE code = ? AND status = 1`, flowCustomerCode)
		if err != nil {
			return err
		}
		if definition == nil {
			return Fail(errcode.ErrFlowNotPublished, "客户申请审批流程未发布")
		}
		eng := engine.NewWithInfra(db, infra.EB(), infra.WF(), infra.SLAHours(), infra.TemporalDriver())
		instanceID, err = eng.Start(toInt(definition["id"]), Str(customer["customer_no"]),
			[]any{"AGG-CUSTOMER-001"}, map[string]any{"customer_id": customerID}, user.ID)
		if err != nil {
			return err
		}
		realName := Str(customer["applicant_name"])
		if realName == "" {
			realName = user.Username
		}
		_, err = store.Exec(db, `
			UPDATE customer_application SET instance_id=?, status='待客户经理审批', applicant_id=?, applicant_name=?,
			updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
			instanceID, user.ID, realName, customerID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return GetCustomer(customerID)
}

// WithdrawCustomer 撤回(仅待客户经理审批且审批人未处理)。
func WithdrawCustomer(customerID int64, user UserInfo) (map[string]any, error) {
	customer, err := GetCustomer(customerID)
	if err != nil {
		return nil, err
	}
	if Str(customer["status"]) != "待客户经理审批" {
		return nil, Fail(errcode.ErrState, "仅待客户经理审批且未处理前可撤回")
	}
	instanceID := toInt(customer["instance_id"])
	if instanceID == 0 {
		return nil, Fail(errcode.ErrNotFound, "流程实例不存在")
	}
	err = tx(func(db *gorm.DB) error {
		done, err := store.Count(db, `
			SELECT COUNT(*) FROM flow_task WHERE instance_id=? AND status IN ('DONE','CANCEL') AND action IS NOT NULL`, instanceID)
		if err != nil {
			return err
		}
		if done > 0 {
			return Fail(errcode.ErrState, "审批人已处理，无法撤回")
		}
		if _, err := store.Exec(db, `
			UPDATE flow_instance SET status='TERMINATED', ended_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`, instanceID); err != nil {
			return err
		}
		if _, err := store.Exec(db, `UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'`, instanceID); err != nil {
			return err
		}
		_, err = store.Exec(db, `
			UPDATE customer_application SET status='草稿', instance_id=NULL,
			updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`, customerID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return GetCustomer(customerID)
}

// SyncCustomerStatusFromInstance 实例状态→客户状态(审批通过/驳回/进行中节点)。
func SyncCustomerStatusFromInstance(db *gorm.DB, instanceID int64) (string, error) {
	inst, err := store.One(db, `SELECT * FROM flow_instance WHERE id = ?`, instanceID)
	if err != nil || inst == nil {
		return "", err
	}
	customer, err := store.One(db, `SELECT * FROM customer_application WHERE instance_id = ?`, instanceID)
	if err != nil || customer == nil {
		return "", err
	}
	var status string
	switch inst["status"] {
	case "APPROVED":
		status = "已通过"
	case "REJECTED":
		status = "已驳回"
	case "RUNNING":
		todo, err := store.One(db, `SELECT * FROM flow_task WHERE instance_id=? AND status='TODO' ORDER BY id LIMIT 1`, instanceID)
		if err != nil {
			return "", err
		}
		if todo != nil {
			if mapped, ok := roleStatusMap[Str(todo["role_ref"])]; ok {
				status = mapped
			} else {
				status = Str(customer["status"])
			}
		}
	}
	if status != "" && status != Str(customer["status"]) {
		_, err := store.Exec(db, `
			UPDATE customer_application SET status=?, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
			status, customer["id"])
		return status, err
	}
	return status, nil
}

var _ = json.Marshal // 占位保持导入(实际经 MarshalJSONVal)
