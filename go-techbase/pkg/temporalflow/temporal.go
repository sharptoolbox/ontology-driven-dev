package temporalflow

import (
	"context"
	"strings"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
)

// TemporalExecutor temporal 驱动原语（workflow 上下文内执行）。
type TemporalExecutor struct {
	Ctx workflow.Context
}

// actOpts 活动（非确定性 IO）统一选项。
func actOpts() workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 3},
	}
}

// Emit 发布步骤事件 —— temporal workflow 内禁止直接网络 IO，经 activity（重放安全）。
func (t *TemporalExecutor) Emit(_ context.Context, topic string, payload map[string]any) error {
	b, _ := json.Marshal(payload)
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	return workflow.ExecuteActivity(actCtx, "EmitEventActivity", topic, json.RawMessage(b)).Get(actCtx, nil)
}

// Webhook HTTP 回调经 activity。
func (t *TemporalExecutor) Webhook(_ context.Context, url string, payload map[string]any) error {
	b, _ := json.Marshal(payload)
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	return workflow.ExecuteActivity(actCtx, "WebhookActivity", url, json.RawMessage(b)).Get(actCtx, nil)
}

// Sleep 服务端持久化定时器（进程重启不丢 —— temporal 核心价值）。
func (t *TemporalExecutor) Sleep(_ context.Context, d time.Duration) error {
	return workflow.Sleep(t.Ctx, d)
}

// CreateHumanTask 经 activity 落待办表，返回任务引用（Signal 通道名 tf-task-<dbid>）。
func (t *TemporalExecutor) CreateHumanTask(_ context.Context, n map[string]any, in RunInput) (HumanTaskRef, error) {
	name, _ := n["name"].(string)
	role, _ := n["role_ref"].(string)
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	var ref HumanTaskRef
	err := workflow.ExecuteActivity(actCtx, "tf.CreateHumanTask", map[string]any{
		"workflow_id": workflow.GetInfo(t.Ctx).WorkflowExecution.ID,
		"def_id":      in.DefID, "run_id": in.RunID, "node_id": nodeID(n),
		"name": name, "role_ref": role, "vars": in.Vars,
	}).Get(actCtx, &ref)
	if err != nil {
		return HumanTaskRef{}, err
	}
	return ref, nil
}

// WaitHumanTask 等待审批 Signal（tf-task-<id>），SLA 到期发超时事件（activity）后继续等。
// 可取消 timer 分支 + Signal 分支的 selector 循环；SLA 只触发一次。
func (t *TemporalExecutor) WaitHumanTask(_ context.Context, ref HumanTaskRef) (HumanOutcome, error) {
	sigCh := workflow.GetSignalChannel(t.Ctx, ref.SignalName)
	var outcome HumanOutcome
	slaDur := 48 * time.Hour

	timerCtx, cancelTimer := workflow.WithCancel(t.Ctx)
	timerF := workflow.NewTimer(timerCtx, slaDur)
	fired := false

	for outcome.Action == "" {
		s := workflow.NewSelector(t.Ctx)
		s.AddReceive(sigCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(t.Ctx, &outcome) })
		if !fired {
			f := timerF
			s.AddFuture(f, func(workflow.Future) {
				fired = true
				cancelTimer()
				actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
				_ = workflow.ExecuteActivity(actCtx, "tf.EmitSLAExceededActivity", map[string]any{
					"task_id": ref.ID, "assignee": ref.AssigneeName,
				}).Get(actCtx, nil)
			})
		}
		s.Select(t.Ctx)
	}
	return outcome, nil
}

// CompleteHumanTask 经 activity 回写任务结果。
func (t *TemporalExecutor) CompleteHumanTask(_ context.Context, ref HumanTaskRef, o HumanOutcome) error {
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	return workflow.ExecuteActivity(actCtx, "tf.CompleteHumanTask", map[string]any{
		"task_id": ref.ID, "action": o.Action, "comment": o.Comment, "operator": o.Operator,
	}).Get(actCtx, nil)
}

// EmitSLAExceeded SLA 事件。
func (t *TemporalExecutor) EmitSLAExceeded(_ context.Context, payload map[string]any) error {
	return t.Emit(context.Background(), TopicPrefix()+".flow.sla.exceeded", payload)
}

// EmitCustom EMIT 节点：向任意主题发事件。
func (t *TemporalExecutor) EmitCustom(_ context.Context, subject string, payload map[string]any) error {
	b, _ := json.Marshal(payload)
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	return workflow.ExecuteActivity(actCtx, "EmitEventActivity", subject, json.RawMessage(b)).Get(actCtx, nil)
}

// LoadSubflowGraph 按 code 加载子流程 DSL（activity 查库；发布后图稳定，重放安全）。
func (t *TemporalExecutor) LoadSubflowGraph(_ context.Context, code string) ([]byte, error) {
	actCtx := workflow.WithActivityOptions(t.Ctx, actOpts())
	var graph string
	if err := workflow.ExecuteActivity(actCtx, "tf.LoadDefGraphByCode", code).Get(actCtx, &graph); err != nil {
		return nil, err
	}
	return []byte(graph), nil
}

// TemporalInterpreterWorkflow 通用解释器工作流（注册名 "temporalInterpreter"）。
// 输入 = RunInput（含 DSL 图 + 运行变量）；重放安全：图/变量来自工作流参数，
// expr 求值为纯函数，IO 全部走 activity。
func TemporalInterpreterWorkflow(ctx workflow.Context, input RunInput) (*RunResult, error) {
	logger := workflow.GetLogger(ctx)
	g, err := Parse(input.Graph)
	if err != nil {
		return nil, err
	}
	// 运行台账登记（activity；重放安全）
	actCtx := workflow.WithActivityOptions(ctx, actOpts())
	wfID := workflow.GetInfo(ctx).WorkflowExecution.ID
	_ = workflow.ExecuteActivity(actCtx, "tf.CreateRun", map[string]any{
		"def_id": input.DefID, "code": input.Code, "run_id": input.RunID,
		"temporal_workflow_id": wfID, "vars": input.Vars,
	}).Get(actCtx, nil)

	ex := &TemporalExecutor{Ctx: ctx}
	// Run 骨架的 ctx 仅透传给 executor 原语（temporal 原语内部用 workflow.Context）
	res, rerr := Run(context.Background(), g, input, ex)

	// 台账收口
	status, outcome := "DONE", ""
	if rerr != nil {
		status, outcome = "FAILED", rerr.Error()
	} else if res != nil {
		outcome = res.Outcome
	}
	_ = workflow.ExecuteActivity(actCtx, "tf.CompleteRun", map[string]any{
		"run_id": input.RunID, "status": status, "outcome": outcome, "error": outcome,
	}).Get(actCtx, nil)
	if rerr != nil {
		logger.Error("temporalflow 运行失败", "run", input.RunID, "err", rerr)
		return nil, rerr
	}
	return res, nil
}

// ── Activities（非确定性原语，普通函数注册）──────────────────────────────────

// EmitEventActivity 发布事件到事件总线（NATS）。
func EmitEventActivity(topic string, payload json.RawMessage) error {
	eb, err := eventbus.New(eventbus.Options{
		Driver:     "nats",
		URL:        envOr("EVENTBUS_URL", "nats://opic-nats:4222"),
		Username:   envOr("EVENTBUS_USERNAME", "opic"),
		Password:   envOr("EVENTBUS_PASSWORD", ""),
		StreamName: streamOrCenter(),
	})
	if err != nil {
		return err
	}
	defer eb.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return eb.Publish(ctx, topic, payload)
}

// WebhookActivity HTTP 回调。
func WebhookActivity(url string, payload json.RawMessage) error {
	var m map[string]any
	_ = json.Unmarshal(payload, &m)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return postJSON(ctx, url, m)
}

// StartInterpreter 启动解释器工作流（temporal 驱动；供 API 层调用）。
func StartInterpreter(address, namespace string, in RunInput) (runID string, err error) {
	c, err := client.Dial(client.Options{HostPort: address, Namespace: namespace})
	if err != nil {
		return "", fmt.Errorf("连接 Temporal %s 失败: %w", address, err)
	}
	defer c.Close()
	wctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	tq := os.Getenv("WORKFLOW_TASK_QUEUE")
	if tq == "" {
		tq = os.Getenv("CENTER_CODE")
	}
	if tq == "" {
		tq = "techbase"
	}
	co := client.StartWorkflowOptions{
		ID:                       fmt.Sprintf("temporalflow-%s-%s", in.Code, in.RunID),
		TaskQueue:                tq,
		WorkflowExecutionTimeout: 24 * time.Hour,
	}
	run, err := c.ExecuteWorkflow(wctx, co, TemporalInterpreterWorkflow, in)
	if err != nil {
		return "", err
	}
	return run.GetRunID(), nil
}

// SignalTask 向运行中的解释器工作流投递人工审批结果 Signal。
func SignalTask(address, namespace, workflowID string, taskID int64, o HumanOutcome) error {
	c, err := client.Dial(client.Options{HostPort: address, Namespace: namespace})
	if err != nil {
		return err
	}
	defer c.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return c.SignalWorkflow(ctx, workflowID, "", fmt.Sprintf("tf-task-%d", taskID), o)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// streamOrCenter stream 名中心化：NATS_STREAM 优先，否则 OPIC_<CENTER_CODE>。
func streamOrCenter() string {
	if v := os.Getenv("NATS_STREAM"); v != "" {
		return v
	}
	if cc := os.Getenv("CENTER_CODE"); cc != "" {
		return "OPIC_" + strings.ToUpper(cc)
	}
	return "OPIC"
}

// TopicPrefix 事件主题前缀中心化：opic.<CENTER_CODE>.<...>（默认 techbase 兼容存量）。
func TopicPrefix() string {
	if v := os.Getenv("NATS_SUBJECT_PREFIX"); v != "" {
		return strings.TrimSuffix(v, ".")
	}
	if cc := os.Getenv("CENTER_CODE"); cc != "" {
		return "opic." + cc
	}
	return "opic.techbase"
}
