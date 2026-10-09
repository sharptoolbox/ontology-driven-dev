package infra

// Temporal flow activities —— 解释器工作流的 DB 原语（依赖本进程 store.DB）。
// 由 RegisterTemporalFlows 注册：tf.CreateHumanTask / tf.CompleteHumanTask /
// tf.EmitSLAExceededActivity / tf.CreateRun / tf.CompleteRun。

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/store"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
)

// TFCreateHumanTaskInput 创建人工待办入参。
type TFCreateHumanTaskInput struct {
	WorkflowID string         `json:"workflow_id"`
	DefID      int64          `json:"def_id"`
	RunID      string         `json:"run_id"`
	NodeID     string         `json:"node_id"`
	Name       string         `json:"name"`
	RoleRef    string         `json:"role_ref"`
	Vars       map[string]any `json:"vars"`
}

// TFCreateHumanTask 创建人工审批待办（按角色解析经办人，语义对齐 V1 resolveAssignee）。
func TFCreateHumanTask(ctx context.Context, in TFCreateHumanTaskInput) (map[string]any, error) {
	assigneeID := int64(0)
	assigneeName := ""
	if in.RoleRef != "" {
		if r, err := store.One(nil, `
			SELECT u.id, u.real_name FROM sys_user u
			JOIN sys_user_role ur ON ur.user_id = u.id
			JOIN sys_role r ON r.id = ur.role_id
			WHERE r.code = ? AND u.status = 1
			ORDER BY u.id LIMIT 1`, in.RoleRef); err == nil && r != nil {
			assigneeID = toI64Any(r["id"])
			assigneeName = trimSpaceAny(r["real_name"])
		}
	}
	if _, err := store.Exec(nil, `
		INSERT INTO temporalflow_task
			(temporal_workflow_id, def_id, run_id, node_id, name, role_ref, assignee_id, assignee_name, status)
		VALUES (?,?,?,?,?,?,?,?, 'TODO')`,
		in.WorkflowID, in.DefID, in.RunID, in.NodeID, in.Name, in.RoleRef, assigneeID, assigneeName); err != nil {
		return nil, err
	}
	r, err := store.One(nil, `SELECT id FROM temporalflow_task WHERE temporal_workflow_id=? AND node_id=? AND status='TODO' ORDER BY id DESC LIMIT 1`,
		in.WorkflowID, in.NodeID)
	if err != nil || r == nil {
		return nil, err
	}
	taskID := toI64Any(r["id"])
	out := map[string]any{
		"id":            taskID,
		"signal_name":   fmt.Sprintf("tf-task-%d", taskID),
		"assignee_id":   assigneeID,
		"assignee_name": assigneeName,
	}
	if eb := tfEventbus(); eb != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = eb.Publish(ctx, tfTopic("flow.task.created"), b)
		}
	}
	return out, nil
}

// TFCompleteHumanTaskInput 完成人工待办入参。
type TFCompleteHumanTaskInput struct {
	TaskID   int64  `json:"task_id"`
	Action   string `json:"action"`
	Comment  string `json:"comment"`
	Operator string `json:"operator"`
}

// TFCompleteHumanTask 回写待办结果。
func TFCompleteHumanTask(_ context.Context, in TFCompleteHumanTaskInput) error {
	_, err := store.Exec(nil, `
		UPDATE temporalflow_task SET status='DONE', action=?, comment=?, operator=?, done_at=now()
		WHERE id=?`, in.Action, in.Comment, in.Operator, in.TaskID)
	return err
}

// TFEmitSLAExceededActivity SLA 超时：标记待办 + 发事件。
func TFEmitSLAExceededActivity(ctx context.Context, in map[string]any) error {
	if _, err := store.Exec(nil, `UPDATE temporalflow_task SET status='SLA' WHERE id=? AND status='TODO'`, in["task_id"]); err != nil {
		log.Printf("[tf] SLA 标记失败: %v", err)
	}
	if eb := tfEventbus(); eb != nil {
		if b, err := json.Marshal(in); err == nil {
			_ = eb.Publish(ctx, tfTopic("flow.sla.exceeded"), b)
		}
	}
	return nil
}

// TFCreateRunInput 运行台账入参。
type TFCreateRunInput struct {
	DefID              int64          `json:"def_id"`
	Code               string         `json:"code"`
	RunID              string         `json:"run_id"`
	TemporalWorkflowID string         `json:"temporal_workflow_id"`
	Vars               map[string]any `json:"vars"`
}

// TFCreateRun 运行台账登记。
func TFCreateRun(_ context.Context, in TFCreateRunInput) error {
	b, _ := json.Marshal(in.Vars)
	_, err := store.Exec(nil, `
		INSERT INTO temporalflow_run (def_id, code, run_id, temporal_workflow_id, status, vars)
		VALUES (?,?,?,?, 'RUNNING', ?)`, in.DefID, in.Code, in.RunID, in.TemporalWorkflowID, string(b))
	return err
}

// TFCompleteRunInput 运行完成入参。
type TFCompleteRunInput struct {
	RunID     string         `json:"run_id"`
	Status    string         `json:"status"` // DONE | FAILED
	Outcome   string         `json:"outcome"`
	Result    map[string]any `json:"result"`
	ErrorText string         `json:"error,omitempty"`
}

// TFCompleteRun 运行台账收口。
func TFCompleteRun(_ context.Context, in TFCompleteRunInput) error {
	b, _ := json.Marshal(in.Result)
	_, err := store.Exec(nil, `
		UPDATE temporalflow_run SET status=?, outcome=?, result=?, error=?, ended_at=now()
		WHERE run_id=?`, in.Status, in.Outcome, string(b), in.ErrorText, in.RunID)
	return err
}

// TFLoadDefGraphByCode 按 code 加载已发布 TEMPORAL 定义的 DSL（子流程用）。
func TFLoadDefGraphByCode(_ context.Context, code string) (string, error) {
	r, err := store.One(nil, `SELECT node_graph FROM flow_definition
		WHERE code=? AND flow_type='TEMPORAL' AND status=1 ORDER BY updated_at DESC LIMIT 1`, code)
	if err != nil {
		return "", err
	}
	if r == nil {
		return "", fmt.Errorf("子流程定义不存在或未发布: %s", code)
	}
	g, _ := r["node_graph"].(string)
	return g, nil
}

// ── 内部 ──

// tfTopic 事件主题中心化：opic.<CENTER_CODE>.<suffix>。
func tfTopic(suffix string) string {
	cc := os.Getenv("CENTER_CODE")
	if cc == "" {
		cc = "techbase"
	}
	return "opic." + cc + "." + suffix
}

// streamOrCenter stream 名中心化。
func streamOrCenter() string {
	if v := os.Getenv("NATS_STREAM"); v != "" {
		return v
	}
	if cc := os.Getenv("CENTER_CODE"); cc != "" {
		return "OPIC_" + strings.ToUpper(cc)
	}
	return "OPIC"
}

func tfEventbus() eventbus.EventBus {
	cc := os.Getenv("CENTER_CODE")
	if cc == "" {
		cc = "techbase"
	}
	subjects := []string{"opic." + cc + ".>"}
	if p := os.Getenv("NATS_SUBJECT_PREFIX"); p != "" {
		subjects = []string{strings.TrimSuffix(p, ".") + ".>"}
	}
	// Subjects 必须与主连接建 stream 时一致——不一致会 10058（stream already in use）
	eb, err := eventbus.New(eventbus.Options{
		Driver: "nats", URL: envOrInf("EVENTBUS_URL", "nats://opic-nats:4222"),
		Username: envOrInf("EVENTBUS_USERNAME", "opic"), Password: envOrInf("EVENTBUS_PASSWORD", ""),
		StreamName: streamOrCenter(), Subjects: subjects,
	})
	if err != nil {
		log.Printf("[infra] tf 活动事件发布降级: %v", err)
		return nil
	}
	return eb
}
