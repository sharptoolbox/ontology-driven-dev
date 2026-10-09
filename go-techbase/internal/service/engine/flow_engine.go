// Package engine —— 轻量工作流引擎:start / approve / reject / return 四个核心方法。
// 与 Python techbase engine/flow_engine.py 语义一一对应;全部操作在传入的事务上执行。
package engine

import (
	"log"
	"time"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/expr"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/ontology"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/workflowx"
)

// Engine 流程引擎(绑定事务或默认连接)。
type Engine struct {
	DB *gorm.DB
	// ── step1 基础设施集成（可空：nil 时降级为纯 v1 行为）──
	EB            eventbus.EventBus  // 流程事件总线（instance/task/sla 四事件）
	WF            workflowx.Client   // SLA 看护工作流（local|temporal）
	SLAHours      float64            // 任务处理时限（默认 48h）
	TemporalDriver bool              // driver=temporal（拉长状态轮询间隔）
	PollInterval  time.Duration      // 看护状态轮询间隔（0=按驱动默认）
}

// New 构造（v1 兼容：无事件/无看护）。
func New(db *gorm.DB) *Engine { return &Engine{DB: db} }

// NewWithInfra 构造并接入 step1（事件总线 + SLA 看护工作流）。
func NewWithInfra(db *gorm.DB, eb eventbus.EventBus, wf workflowx.Client, slaHours float64, temporalDriver bool) *Engine {
	if slaHours <= 0 {
		slaHours = 48
	}
	return &Engine{DB: db, EB: eb, WF: wf, SLAHours: slaHours, TemporalDriver: temporalDriver}
}

// watchCreatedTasks 为新建 TODO 任务挂 SLA 看护并发布 task.created（旁路）。
func (e *Engine) watchCreatedTasks(instanceID int64) {
	if e.WF == nil && e.EB == nil {
		return
	}
	tasks, err := store.List(e.DB, `SELECT id, activity_name FROM flow_task WHERE instance_id=? AND status='TODO'`, instanceID)
	if err != nil {
		log.Printf("[flow-events] 查询新任务失败 instance=%d: %v", instanceID, err)
		return
	}
	for _, t := range tasks {
		taskID := toInt64(t["id"])
		title := s(t["activity_name"])
		if e.WF != nil {
			e.startGuardian(instanceID, taskID, title)
		}
		if e.EB != nil {
			e.publish(TopicTaskCreated(), map[string]any{"instance_id": instanceID, "task_id": taskID, "task_title": title})
		}
	}
}

// GetDefinition 按ID取定义。
func (e *Engine) GetDefinition(defID int64) (map[string]any, error) {
	return store.One(e.DB, `SELECT * FROM flow_definition WHERE id = ?`, defID)
}

// GetDefinitionByCode 按编码取定义。
func (e *Engine) GetDefinitionByCode(code string) (map[string]any, error) {
	return store.One(e.DB, `SELECT * FROM flow_definition WHERE code = ?`, code)
}

// ParseGraph 解析 node_graph 文本为对象。
func ParseGraph(definition map[string]any) map[string]any {
	return parseJSON(definition["node_graph"], map[string]any{"nodes": []any{}, "edges": []any{}}).(map[string]any)
}

func parseJSON(v any, def any) any {
	switch x := v.(type) {
	case string:
		if x == "" {
			return def
		}
		var out any
		if err := json.Unmarshal([]byte(x), &out); err != nil {
			return def
		}
		return out
	case nil:
		return def
	default:
		return x
	}
}

// GetInstance 取实例。
func (e *Engine) GetInstance(instanceID int64) (map[string]any, error) {
	return store.One(e.DB, `SELECT * FROM flow_instance WHERE id = ?`, instanceID)
}

// GetTask 取任务。
func (e *Engine) GetTask(taskID int64) (map[string]any, error) {
	return store.One(e.DB, `SELECT * FROM flow_task WHERE id = ?`, taskID)
}

func (e *Engine) node(graph map[string]any, nodeID string) map[string]any {
	nodes, _ := graph["nodes"].([]any)
	for _, n := range nodes {
		nm, ok := n.(map[string]any)
		if !ok {
			continue
		}
		if s, _ := nm["id"].(string); s == nodeID {
			return nm
		}
	}
	return nil
}

func (e *Engine) outgoing(graph map[string]any, nodeID string) []map[string]any {
	edges, _ := graph["edges"].([]any)
	var out []map[string]any
	for _, ed := range edges {
		em, ok := ed.(map[string]any)
		if !ok {
			continue
		}
		if s, _ := em["source"].(string); s == nodeID {
			out = append(out, em)
		}
	}
	return out
}

func (e *Engine) resolveAssignee(roleRef string) (int64, string) {
	if roleRef == "" {
		return 0, ""
	}
	row, err := store.One(e.DB, `
		SELECT u.id, u.real_name, u.username FROM sys_user u
		JOIN sys_user_role ur ON ur.user_id = u.id
		JOIN sys_role r ON r.id = ur.role_id
		WHERE r.code = ? AND u.status = 1
		ORDER BY u.id LIMIT 1`, roleRef)
	if err != nil || row == nil {
		return 0, ""
	}
	name, _ := row["real_name"].(string)
	if name == "" {
		name, _ = row["username"].(string)
	}
	return toInt64(row["id"]), name
}

// Start 启动流程实例。
func (e *Engine) Start(defID int64, businessKey string, businessObjectRefs []any, variables map[string]any, creatorID int64) (int64, error) {
	definition, err := e.GetDefinition(defID)
	if err != nil {
		return 0, err
	}
	if definition == nil {
		return 0, errcode.Fail(errcode.ErrNotFound, "流程定义不存在")
	}
	graph := ParseGraph(definition)

	if businessObjectRefs == nil {
		businessObjectRefs = []any{}
	}
	if variables == nil {
		variables = map[string]any{}
	}
	if err := e.DB.Exec(`
		INSERT INTO flow_instance
			(def_id, business_key, business_object_refs, current_activity_ids, variables, creator_id, status)
		VALUES (?, ?, ?, ?, ?, ?, 'RUNNING')`,
		defID, businessKey, marshal(businessObjectRefs), "[]", marshal(variables), creatorID).Error; err != nil {
		return 0, err
	}
	var instID int64
	if err := e.DB.Raw("SELECT LASTVAL()").Scan(&instID).Error; err != nil {
		return 0, err
	}

	if err := e.writeHistory(instID, "", "开始", creatorID, "", "START", "", "", ""); err != nil {
		return 0, err
	}
	var startNode map[string]any
	nodes, _ := graph["nodes"].([]any)
	for _, n := range nodes {
		nm, _ := n.(map[string]any)
		if nm != nil && nm["type"] == "start" {
			startNode = nm
			break
		}
	}
	if startNode == nil {
		return 0, errcode.Fail(errcode.ErrGraph, "流程缺少开始节点")
	}
	current, err := e.activate(instID, startNode, graph, creatorID)
	if err != nil {
		return 0, err
	}
	if err := e.setCurrent(instID, current); err != nil {
		return 0, err
	}
	// ── step1 接线：实例启动事件 + 任务 SLA 看护（旁路，失败不回滚审批）──
	e.publish(TopicInstanceStarted(), map[string]any{
		"instance_id": instID, "def_id": defID, "business_key": businessKey, "creator_id": creatorID,
	})
	e.watchCreatedTasks(instID)
	return instID, nil
}

func marshal(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func (e *Engine) setCurrent(instanceID int64, ids []string) error {
	raw, _ := json.Marshal(ids)
	return e.DB.Exec(`UPDATE flow_instance SET current_activity_ids = ? WHERE id = ?`, string(raw), instanceID).Error
}

// Approve 通过。
func (e *Engine) Approve(taskID int64, comment string, operatorID int64, operatorName string) (map[string]any, error) {
	return e.complete(taskID, "APPROVE", comment, operatorID, operatorName)
}

// Reject 驳回。
func (e *Engine) Reject(taskID int64, comment string, operatorID int64, operatorName string) (map[string]any, error) {
	return e.complete(taskID, "REJECT", comment, operatorID, operatorName)
}

// ReturnTo 退回到指定活动节点。
func (e *Engine) ReturnTo(taskID int64, targetActivityID, comment string, operatorID int64, operatorName string) (map[string]any, error) {
	task, err := e.GetTask(taskID)
	if err != nil {
		return nil, err
	}
	if task == nil || task["status"] != "TODO" {
		return nil, errcode.Fail(errcode.ErrFlowState, "任务不存在或已处理")
	}
	inst, err := e.GetInstance(toInt64(task["instance_id"]))
	if err != nil {
		return nil, err
	}
	definition, err := e.GetDefinition(toInt64(inst["def_id"]))
	if err != nil {
		return nil, err
	}
	graph := ParseGraph(definition)

	if err := e.DB.Exec(`
		UPDATE flow_task SET status='CANCEL', action='RETURN', comment=?, done_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
		comment, taskID).Error; err != nil {
		return nil, err
	}
	if err := e.DB.Exec(`UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'`,
		inst["id"]).Error; err != nil {
		return nil, err
	}
	if err := e.writeHistory(toInt64(inst["id"]), s(task["activity_id"]), s(task["activity_name"]),
		operatorID, operatorName, "RETURN", comment, s(task["activity_id"]), targetActivityID); err != nil {
		return nil, err
	}
	target := e.node(graph, targetActivityID)
	current, err := e.activate(toInt64(inst["id"]), target, graph, operatorID)
	if err != nil {
		return nil, err
	}
	if err := e.DB.Exec(`
		UPDATE flow_instance SET current_activity_ids=?, status='RUNNING' WHERE id=?`,
		marshal(current), inst["id"]).Error; err != nil {
		return nil, err
	}
	return e.Result(toInt64(inst["id"]))
}

func (e *Engine) complete(taskID int64, action, comment string, operatorID int64, operatorName string) (map[string]any, error) {
	task, err := e.GetTask(taskID)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, errcode.Fail(errcode.ErrNotFound, "任务不存在")
	}
	if task["status"] != "TODO" {
		return nil, errcode.Fail(errcode.ErrFlowState, "任务已处理，不能重复操作")
	}
	inst, err := e.GetInstance(toInt64(task["instance_id"]))
	if err != nil {
		return nil, err
	}
	if inst == nil || inst["status"] != "RUNNING" {
		return nil, errcode.Fail(errcode.ErrFlowState, "流程实例已结束")
	}
	if err := e.DB.Exec(`
		UPDATE flow_task SET status='DONE', action=?, comment=?, done_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
		action, comment, taskID).Error; err != nil {
		return nil, err
	}
	if err := e.writeHistory(toInt64(inst["id"]), s(task["activity_id"]), s(task["activity_name"]),
		operatorID, operatorName, action, comment, "", ""); err != nil {
		return nil, err
	}
	definition, err := e.GetDefinition(toInt64(inst["def_id"]))
	if err != nil {
		return nil, err
	}
	graph := ParseGraph(definition)
	if _, err := e.advance(inst, graph, s(task["activity_id"]), action, operatorID); err != nil {
		return nil, err
	}
	e.cancelGuardian(taskID) // 任务已处理，看护退出（旁路）
	return e.Result(toInt64(inst["id"]))
}

// Result 实例结果摘要。
func (e *Engine) Result(instanceID int64) (map[string]any, error) {
	inst, err := e.GetInstance(instanceID)
	if err != nil {
		return nil, err
	}
	todos, err := store.List(e.DB, `SELECT activity_id FROM flow_task WHERE instance_id=? AND status='TODO'`, instanceID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(todos))
	for _, t := range todos {
		ids = append(ids, s(t["activity_id"]))
	}
	return map[string]any{
		"instance_id":          instanceID,
		"status":               inst["status"],
		"current_activity_ids": ids,
	}, nil
}

// advance 推进:从 fromActivity 出发按 outcome 激活后继。
func (e *Engine) advance(inst map[string]any, graph map[string]any, fromActivityID, outcome string, operatorID int64) ([]string, error) {
	node := e.node(graph, fromActivityID)
	outgoing := e.outgoing(graph, fromActivityID)
	if node == nil || node["type"] == "end" {
		return e.currentIDs(toInt64(inst["id"]))
	}
	var selected []string
	if node["type"] == "gateway" {
		selected = e.selectGatewayTargets(node, outgoing, inst)
	} else {
		for _, edge := range outgoing {
			if ec, ok := edge["approval_outcome"]; ok && ec != nil {
				if s(ec) != outcome {
					continue
				}
			}
			selected = append(selected, s(edge["target"]))
		}
	}
	for _, target := range selected {
		tgtNode := e.node(graph, target)
		if _, err := e.activate(toInt64(inst["id"]), tgtNode, graph, operatorID); err != nil {
			return nil, err
		}
	}
	return e.currentIDs(toInt64(inst["id"]))
}

// activate 激活节点(递归推进自动节点)。
func (e *Engine) activate(instanceID int64, node map[string]any, graph map[string]any, operatorID int64) ([]string, error) {
	if node == nil {
		return nil, nil
	}
	nt, _ := node["type"].(string)
	switch nt {
	case "end":
		return nil, e.reachEnd(instanceID, node)
	case "user_task", "approval_task":
		roleRef, _ := node["role_ref"].(string)
		assigneeID, assigneeName := e.resolveAssignee(roleRef)
		name, _ := node["name"].(string)
		behaviorRef, _ := node["behavior_ref"].(string)
		if err := e.DB.Exec(`
			INSERT INTO flow_task
				(instance_id, activity_id, activity_type, activity_name, role_ref, behavior_ref, assignee_id, assignee_name, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO')`,
			instanceID, node["id"], nt, name, roleRef, behaviorRef,
			nullable(assigneeID), nullableStr(assigneeName)).Error; err != nil {
			return nil, err
		}
		return []string{s(node["id"])}, nil
	case "start", "system_task", "behavior_call", "sub_flow_call":
		if nt == "system_task" || nt == "behavior_call" {
			name, _ := node["name"].(string)
			if err := e.writeHistory(instanceID, s(node["id"]), name, operatorID, "", "EXECUTE", "自动执行", "", ""); err != nil {
				return nil, err
			}
		}
		var ids []string
		seen := map[string]bool{}
		for _, edge := range e.outgoing(graph, s(node["id"])) {
			tgt := e.node(graph, s(edge["target"]))
			sub, err := e.activate(instanceID, tgt, graph, operatorID)
			if err != nil {
				return nil, err
			}
			for _, id := range sub {
				if !seen[id] {
					seen[id] = true
					ids = append(ids, id)
				}
			}
		}
		return ids, nil
	case "gateway":
		inst, err := e.GetInstance(instanceID)
		if err != nil {
			return nil, err
		}
		targets := e.selectGatewayTargets(node, e.outgoing(graph, s(node["id"])), inst)
		var ids []string
		seen := map[string]bool{}
		for _, t := range targets {
			sub, err := e.activate(instanceID, e.node(graph, t), graph, operatorID)
			if err != nil {
				return nil, err
			}
			for _, id := range sub {
				if !seen[id] {
					seen[id] = true
					ids = append(ids, id)
				}
			}
		}
		return ids, nil
	}
	return nil, nil
}

func (e *Engine) reachEnd(instanceID int64, node map[string]any) error {
	result, _ := node["result"].(string)
	if result == "" {
		result = "APPROVED"
	}
	status := "APPROVED"
	if result == "REJECTED" {
		status = "REJECTED"
	}
	if err := e.DB.Exec(
		`UPDATE flow_instance SET status=?, ended_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?`, status, instanceID).Error; err != nil {
		return err
	}
	return e.DB.Exec(`UPDATE flow_task SET status='CANCEL' WHERE instance_id=? AND status='TODO'`, instanceID).Error
}

// selectGatewayTargets 网关分支选择(rule_ref → approval_outcome → condition → default)。
func (e *Engine) selectGatewayTargets(node map[string]any, outgoing []map[string]any, inst map[string]any) []string {
	var variables map[string]any
	if inst != nil {
		variables, _ = parseJSON(inst["variables"], map[string]any{}).(map[string]any)
	}
	branches, _ := node["branches"].([]any)
	var targets []string
	var defaultTarget string
	for _, b := range branches {
		bm, ok := b.(map[string]any)
		if !ok {
			continue
		}
		target := s(bm["target"])
		if isTrue, _ := bm["is_default"].(bool); isTrue {
			defaultTarget = target
			continue
		}
		if rr, _ := bm["rule_ref"].(string); rr != "" && e.evalRule(rr, variables) {
			targets = append(targets, target)
			break
		}
		if ao, _ := bm["approval_outcome"].(string); ao != "" && s(variables["outcome"]) == ao {
			targets = append(targets, target)
			break
		}
		if cond, _ := bm["condition"].(string); cond != "" && expr.EvalBool(cond, variables) {
			targets = append(targets, target)
			break
		}
	}
	if len(targets) == 0 && defaultTarget != "" {
		targets = append(targets, defaultTarget)
	}
	if len(targets) == 0 && len(outgoing) > 0 {
		targets = append(targets, s(outgoing[0]["target"]))
	}
	seen := map[string]bool{}
	var out []string
	for _, t := range targets {
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out
}

// evalRule 求值 M3 规则表达式(registry 注册表)。
func (e *Engine) evalRule(ruleRef string, variables map[string]any) bool {
	reg := ontology.Load()
	rule, ok := reg.Rules[ruleRef]
	if !ok {
		return false
	}
	params := map[string]any{}
	for k, v := range variables {
		params[k] = v
	}
	if inputParams, ok := rule["inputParams"].([]any); ok {
		for _, p := range inputParams {
			pm, _ := p.(map[string]any)
			name, _ := pm["name"].(string)
			if name == "" {
				continue
			}
			if _, has := params[name]; !has {
				if v, has2 := variables[snake(name)]; has2 {
					params[name] = v
				}
			}
		}
	}
	exprText, _ := rule["expression"].(string)
	return expr.EvalBool(strings.TrimSpace(exprText), params)
}

func (e *Engine) currentIDs(instanceID int64) ([]string, error) {
	rows, err := store.List(e.DB, `SELECT activity_id FROM flow_task WHERE instance_id=? AND status='TODO'`, instanceID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, s(r["activity_id"]))
	}
	return ids, nil
}

func (e *Engine) writeHistory(instanceID int64, activityID, activityName string, operatorID int64,
	operatorName, action, comment, fromActivity, toActivity string) error {
	return e.DB.Exec(`
		INSERT INTO flow_history
			(instance_id, activity_id, activity_name, operator_id, operator_name, action, comment, from_activity, to_activity)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		instanceID, nullableStr(activityID), nullableStr(activityName), nullable(operatorID),
		nullableStr(operatorName), action, nullableStr(comment), nullableStr(fromActivity), nullableStr(toActivity)).Error
}

// ---------- 工具 ----------

func s(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	}
	return fmt.Sprintf("%v", v)
}

func snake(name string) string {
	var out []rune
	for i, ch := range name {
		if ch >= 'A' && ch <= 'Z' && i > 0 {
			out = append(out, '_')
		}
		out = append(out, ch+('a'-'A'))
	}
	return string(out)
}

func nullable(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}

func nullableStr(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func toInt64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
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
