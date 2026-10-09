package adminconsole

// Temporal 流程设计器 API —— 挂 /api/admin/temporalflow（管理控制台）。
//
// 端点:
//   GET  /api/admin/temporalflow/definitions           列表（flow_type=TEMPORAL）
//   GET  /api/admin/temporalflow/definitions/:id       详情（含 node_graph）
//   POST /api/admin/temporalflow/definitions           新建/保存（草稿）
//   POST /api/admin/temporalflow/definitions/:id/publish   发布（status=1）
//   POST /api/admin/temporalflow/definitions/:id/run       试运行（启动 Temporal 解释器工作流）
//
// 存储复用 flow_definition（flow_type='TEMPORAL'，node_graph 存 DSL 图），
// 与 V1 审批流（APPROVAL）同表不同类，互不干扰。

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/api/common"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/expr"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/service"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/errcode"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/llmcfg"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/temporalflow"

	"github.com/gin-gonic/gin"
)

const flowTypeTemporal = "TEMPORAL"

// Register 挂载路由（管理控制台，已过登录+system:manage 权限）。
func RegisterTemporalFlow(g *gin.RouterGroup) {
	g.GET("/temporalflow/definitions", list)
	g.GET("/temporalflow/definitions/:id", get)
	g.POST("/temporalflow/definitions", save)
	g.PUT("/temporalflow/definitions/:id", save) // 设计器"保存"走 PUT(编辑已有流程)
	g.POST("/temporalflow/definitions/:id/publish", publish)
	g.POST("/temporalflow/definitions/:id/run", run)
	g.POST("/temporalflow/validate", validate) // 设计器即时校验（不落库）
	g.GET("/temporalflow/tasks", TaskList)
	g.POST("/temporalflow/tasks/:id/approve", TaskApprove)
	g.POST("/temporalflow/tasks/:id/reject", TaskReject)
	g.GET("/temporalflow/runs", RunList)
}

func list(c *gin.Context) {
	rows, err := store.List(nil, `SELECT id, code, name, description, version, status, created_at, updated_at
		FROM flow_definition WHERE flow_type=? ORDER BY updated_at DESC`, flowTypeTemporal)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	common.OKJSON(c, rows, "")
}

func get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id 非法"})
		return
	}
	row, err := store.One(nil, `SELECT id, code, name, description, node_graph, version, status FROM flow_definition
		WHERE id=? AND flow_type=?`, id, flowTypeTemporal)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if row == nil {
		common.FailJSON(c, fmt.Errorf("流程定义不存在"))
		return
	}
	common.OKJSON(c, row, "")
}

// save 新建或更新（body: {id?, code, name, description, node_graph(JSON 对象)}）。
// PUT /definitions/:id 时以路径 id 为准（前端 body 可能缺 id）。
func save(c *gin.Context) {
	var body struct {
		ID          int64           `json:"id"`
		Code        string          `json:"code"`
		Name        string          `json:"name"`
		Description string          `json:"description"`
		NodeGraph   json.RawMessage `json:"node_graph"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		common.FailJSON(c, err)
		return
	}
	if body.ID <= 0 {
		if pid, err := strconv.ParseInt(c.Param("id"), 10, 64); err == nil && pid > 0 {
			body.ID = pid
		}
	}
	if body.Code == "" || body.Name == "" || len(body.NodeGraph) == 0 {
		common.FailJSON(c, fmt.Errorf("code/name/node_graph 必填"))
		return
	}
	// 保存前强校验 DSL
	if _, err := temporalflow.Parse(body.NodeGraph); err != nil {
		common.FailJSON(c, err)
		return
	}
	var createdBy any
	if v, ok := c.Get("userID"); ok {
		createdBy = v
	}
	now := time.Now().Format("2006-01-02 15:04:05")
	if body.ID > 0 {
		if _, err := store.Exec(nil, `UPDATE flow_definition SET code=?, name=?, description=?, node_graph=?, updated_at=? WHERE id=? AND flow_type=?`,
			body.Code, body.Name, body.Description, string(body.NodeGraph), now, body.ID, flowTypeTemporal); err != nil {
			common.FailJSON(c, err)
			return
		}
		common.OKJSON(c, gin.H{"id": body.ID}, "保存成功")
		return
	}
	row, err := store.One(nil, `INSERT INTO flow_definition (code, name, flow_type, description, node_graph, version, status, created_by, created_at, updated_at)
		VALUES (?,?,?,?,?,0,0,?,?,?) RETURNING id`, body.Code, body.Name, flowTypeTemporal, body.Description, string(body.NodeGraph), createdBy, now, now)
	if err != nil {
		if strings.Contains(err.Error(), "flow_definition_code_key") || strings.Contains(err.Error(), "duplicate key") {
			c.JSON(200, errcode.New(errcode.ErrParam, "流程编码已存在: "+body.Code, nil))
			return
		}
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"id": toI64(row["id"])}, "保存成功")
}

// publish 发布（status=1；发布前强校验）。
func publish(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id 非法"})
		return
	}
	row, err := store.One(nil, `SELECT node_graph FROM flow_definition WHERE id=? AND flow_type=?`, id, flowTypeTemporal)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if row == nil {
		common.FailJSON(c, fmt.Errorf("流程定义不存在"))
		return
	}
	graphJSON, _ := row["node_graph"].(string)
	if _, err := temporalflow.Parse([]byte(graphJSON)); err != nil {
		common.FailJSON(c, fmt.Errorf("DSL 校验失败: %s", err.Error()))
		return
	}
	if _, err := store.Exec(nil, `UPDATE flow_definition SET status=1, updated_at=? WHERE id=?`, time.Now().Format("2006-01-02 15:04:05"), id); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"published": true}, "发布成功")
}

// run 试运行：启动 Temporal 解释器工作流（RUN_ID 用时间戳；变量可选）。
func run(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id 非法"})
		return
	}
	var body struct {
		Vars    map[string]any `json:"vars"`
		Address string         `json:"address"`
	}
	_ = c.ShouldBindJSON(&body)
	address := body.Address
	if address == "" {
		address = envDefault("WORKFLOW_ADDRESS", "temporal:7233")
	}
	row, err := store.One(nil, `SELECT id, code, node_graph, status FROM flow_definition WHERE id=? AND flow_type=?`, id, flowTypeTemporal)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if row == nil {
		common.FailJSON(c, fmt.Errorf("流程定义不存在"))
		return
	}
	if toI64(row["status"]) != 1 {
		common.FailJSON(c, fmt.Errorf("流程未发布，不能试运行"))
		return
	}
	graphJSON, _ := row["node_graph"].(string)
	in := temporalflow.RunInput{
		DefID: id,
		Code:  fmt.Sprint(row["code"]),
		RunID: fmt.Sprintf("run-%d", time.Now().UnixMilli()),
		Graph: json.RawMessage(graphJSON),
		Vars:  body.Vars,
	}
	if in.Vars == nil {
		in.Vars = map[string]any{}
	}
	runID, err := temporalflow.StartInterpreter(address, envDefault("WORKFLOW_NAMESPACE", "opic"), in)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"run_id": runID, "workflow_id": fmt.Sprintf("temporalflow-%s-%s", in.Code, in.RunID)}, "试运行已启动")
}

// validate 设计器即时校验（不落库）：DSL 结构 + 表达式试算。
func validate(c *gin.Context) {
	var body struct {
		NodeGraph json.RawMessage `json:"node_graph"`
		Vars      map[string]any  `json:"vars"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	g, err := temporalflow.Parse(body.NodeGraph)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	// 条件表达式逐一试算（纯函数，无副作用）
	issues := []string{}
	for _, n := range g.Nodes {
		if fmt.Sprint(n["type"]) == temporalflow.NodeCondition {
			e, _ := n["expr"].(string)
			if e == "" {
				issues = append(issues, fmt.Sprintf("节点 %s 缺少 expr", n["id"]))
				continue
			}
			if v, eerr := expr.Eval(e, body.Vars); eerr != nil || v == nil {
				issues = append(issues, fmt.Sprintf("节点 %s 表达式求值失败: %s", n["id"], e))
			}
		}
	}
	if len(issues) > 0 {
		common.FailJSON(c, fmt.Errorf("%s", strings.Join(issues, "；")))
		return
	}
	common.OKJSON(c, gin.H{"valid": true}, "校验通过")
}

// ── 内部 ──

func osGetenv(k string) string { return os.Getenv(k) }

// dupFriendly 唯一码冲突转友好错误。
func dupFriendly(err error, code string) error {
	if err != nil && (strings.Contains(err.Error(), "flow_definition_code_key") || strings.Contains(err.Error(), "duplicate key")) {
		return fmt.Errorf("流程编码已存在: %s", code)
	}
	return err
}

func toI64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int32:
		return int64(x)
	case int16:
		return int64(x)
	case int8:
		return int64(x)
	case int:
		return int64(x)
	case uint:
		return int64(x)
	case float64:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	}
	return 0
}

func envDefault(k, def string) string {
	if v := osGetenv(k); v != "" {
		return v
	}
	return def
}

// ── 运行与任务 ──────────────────────────────────────────────────────────────

// TaskList 人工待办列表（?status=TODO|DONE|SLA&run_id=）。
func TaskList(c *gin.Context) {
	status := c.DefaultQuery("status", "TODO")
	runID := c.Query("run_id")
	rows, err := store.List(nil, `SELECT t.id, t.temporal_workflow_id, t.def_id, t.run_id, t.node_id,
		t.name, t.role_ref, t.assignee_id, t.assignee_name, t.status, t.action, t.comment, t.created_at, d.name AS def_name
		FROM temporalflow_task t LEFT JOIN flow_definition d ON d.id = t.def_id
		WHERE (? = '' OR t.status = ?) AND (? = '' OR t.run_id = ?)
		ORDER BY t.id DESC LIMIT 200`, status, status, runID, runID)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	common.OKJSON(c, rows, "")
}

// RunList 运行列表。
func RunList(c *gin.Context) {
	rows, err := store.List(nil, `SELECT r.id, r.def_id, r.code, r.run_id, r.temporal_workflow_id,
		r.status, r.outcome, r.created_at, r.ended_at, d.name AS def_name
		FROM temporalflow_run r LEFT JOIN flow_definition d ON d.id = r.def_id
		ORDER BY r.id DESC LIMIT 200`)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	common.OKJSON(c, rows, "")
}

// taskAct 审批/驳回：向解释器工作流发 Signal（tf-task-<id>），工作流内 activity 回写 DB。
func taskAct(c *gin.Context, action string) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id 非法"})
		return
	}
	var body struct {
		Comment string `json:"comment"`
	}
	_ = c.ShouldBindJSON(&body)
	row, err := store.One(nil, `SELECT temporal_workflow_id FROM temporalflow_task WHERE id=?`, id)
	if err != nil {
		common.FailJSON(c, err)
		return
	}
	if row == nil {
		common.FailJSON(c, fmt.Errorf("任务不存在"))
		return
	}
	wfID := fmt.Sprint(row["temporal_workflow_id"])
	operator := "admin"
	if v, ok := c.Get("username"); ok {
		operator = fmt.Sprint(v)
	}
	if err := temporalflow.SignalTask(envDefault("WORKFLOW_ADDRESS", "temporal:7233"),
		envDefault("WORKFLOW_NAMESPACE", "opic"), wfID, id, temporalflow.HumanOutcome{
			Action: action, Comment: body.Comment, Operator: operator,
		}); err != nil {
		common.FailJSON(c, err)
		return
	}
	// 业务审计(审计日志页数据源)
	uid, uname := int64(0), operator
	if v, ok := c.Get("userID"); ok {
		if n, ok2 := v.(int64); ok2 {
			uid = n
		}
	}
	_ = uname
	service.WriteAudit(nil, uid, operator, action, fmt.Sprintf("Temporal 审批任务 #%d %s", id, body.Comment))
	common.OKJSON(c, gin.H{"signaled": true, "task_id": id, "action": action}, "已提交")
}

// LLMConfigGet 读取 AI 模型配置（api_key 打码）。
func LLMConfigGet(c *gin.Context) {
	cfg, has := llmcfg.Get()
	if !has {
		cfg = &llmcfg.Config{Provider: "openai", Temperature: 0.3}
	}
	hasKey := cfg.APIKey != ""
	cfg.APIKey = ""
	c.JSON(http.StatusOK, gin.H{"config": cfg, "has_key": hasKey})
}

// LLMConfigSaveBody 保存入参。
type LLMConfigSaveBody struct {
	Provider    string  `json:"provider"`
	BaseURL     string  `json:"base_url"`
	Model       string  `json:"model"`
	APIKey      string  `json:"api_key"`
	Temperature float64 `json:"temperature"`
	Enabled     bool    `json:"enabled"`
}

// LLMConfigSave 保存 AI 模型配置（api_key 空则保留原值）。
func LLMConfigSave(c *gin.Context) {
	var body LLMConfigSaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		common.FailJSON(c, err)
		return
	}
	cfg, _ := llmcfg.Get()
	if body.APIKey == "" && cfg != nil {
		body.APIKey = cfg.APIKey // 留空=保留旧密钥
	}
	if err := llmcfg.Save(&llmcfg.Config{
		Provider: body.Provider, BaseURL: body.BaseURL, Model: body.Model,
		APIKey: body.APIKey, Temperature: body.Temperature, Enabled: body.Enabled,
	}); err != nil {
		common.FailJSON(c, err)
		return
	}
	common.OKJSON(c, gin.H{"saved": true}, "AI 模型配置已保存")
}

// TaskApprove 审批通过。
func TaskApprove(c *gin.Context) { taskAct(c, "APPROVE") }

// TaskReject 驳回。
func TaskReject(c *gin.Context) { taskAct(c, "REJECT") }
