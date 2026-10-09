package temporalflow

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/pkg/expr"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
)

// 事件主题（step 执行轨迹进事件总线，供观测/审计/联动）。
// 事件主题按 CENTER_CODE 派生（中心级隔离；默认前缀 opic.techbase 兼容存量）。
func TopicSLAExceeded() string   { return TopicPrefix() + ".flow.sla.exceeded" }
func TopicStepStarted() string   { return TopicPrefix() + ".temporalflow.step.started" }
func TopicStepCompleted() string { return TopicPrefix() + ".temporalflow.step.completed" }
func TopicRunCompleted() string  { return TopicPrefix() + ".temporalflow.run.completed" }

// RunInput 解释器工作流输入（Start 时经 StartOptions.Input 传入）。
type RunInput struct {
	DefID    int64          `json:"def_id"`
	Code     string         `json:"code"`
	RunID    string         `json:"run_id"`
	Graph    json.RawMessage `json:"graph"`
	Vars     map[string]any `json:"vars"`
}

// HumanOutcome 人工审批结果。
type HumanOutcome struct {
	Action   string `json:"action"`   // APPROVE | REJECT
	Comment  string `json:"comment,omitempty"`
	Operator string `json:"operator,omitempty"`
}

// HumanTaskRef 人工任务引用（创建后返回；等待/完成凭它定位）。
type HumanTaskRef struct {
	ID           int64  `json:"id"`
	SignalName   string `json:"signal_name"` // temporal Signal 通道名
	AssigneeID   int64  `json:"assignee_id"`
	AssigneeName string `json:"assignee_name"`
}

// StepExecutor 步骤执行 + 计时 + 人工任务原语（双驱动各自的实现面）。
type StepExecutor interface {
	// Emit 发布步骤事件（step.started/completed）。
	Emit(ctx context.Context, topic string, payload map[string]any) error
	// Webhook HTTP POST 回调（step 可选动作）。
	Webhook(ctx context.Context, url string, payload map[string]any) error
	// Sleep 计时（temporal: workflow.Sleep 服务端持久化；local: time.After）。
	Sleep(ctx context.Context, d time.Duration) error
	// CreateHumanTask 创建人工审批待办（DB 落表 + SLA/事件由驱动内处理），返回任务引用。
	CreateHumanTask(ctx context.Context, n map[string]any, in RunInput) (HumanTaskRef, error)
	// WaitHumanTask 阻塞等待审批 Signal（temporal: GetSignalChannel；local: channel）。
	WaitHumanTask(ctx context.Context, ref HumanTaskRef) (HumanOutcome, error)
	// CompleteHumanTask 回写任务结果（DB 状态/意见/操作人）。
	CompleteHumanTask(ctx context.Context, ref HumanTaskRef, o HumanOutcome) error
	// EmitSLAExceeded 发布 SLA 超时事件。
	EmitSLAExceeded(ctx context.Context, payload map[string]any) error
	// EmitCustom 向任意主题发事件（EMIT 节点）。
	EmitCustom(ctx context.Context, subject string, payload map[string]any) error
	// LoadSubflowGraph 按 code 加载子流程 DSL 图（SUBFLOW 节点）。
	LoadSubflowGraph(ctx context.Context, code string) ([]byte, error)
}

// RunResult 运行结果摘要。
type RunResult struct {
	Steps    int    `json:"steps"`
	Finished bool   `json:"finished"`
	Outcome  string `json:"outcome,omitempty"` // APPROVED | REJECTED（含 HUMAN 驳回终态）
	Error    string `json:"error,omitempty"`
}

// Run 解释执行（驱动无关骨架：Sleep/Emit/Webhook 由 StepExecutor 提供）。
// 每步：Emit step.started →（timer: Sleep / step: 可选 webhook）→ Emit step.completed → next。
func Run(ctx context.Context, g *Graph, in RunInput, ex StepExecutor) (*RunResult, error) {
	cur, err := startID(g)
	if err != nil {
		return nil, err
	}
	res := &RunResult{}
	for i := 0; i < MaxSteps; i++ {
		n := nodeById(g, cur)
		if n == nil {
			return res, fmt.Errorf("节点 %s 不存在", cur)
		}
		switch nodeType(n) {
		case NodeEnd:
			res.Finished = true
			if res.Outcome == "" {
				res.Outcome = "APPROVED"
			}
			_ = ex.Emit(ctx, TopicRunCompleted(), map[string]any{
				"run_id": in.RunID, "def_id": in.DefID, "code": in.Code,
				"steps": res.Steps, "outcome": res.Outcome,
			})
			return res, nil
		case NodeTimer:
			sec, _ := n["seconds"].(float64)
			if sec <= 0 {
				sec = 1
			}
			if err := ex.Emit(ctx, TopicStepStarted(), stepPayload(in, n, res.Steps)); err != nil {
				return res, err
			}
			if err := ex.Sleep(ctx, time.Duration(sec)*time.Second); err != nil {
				return res, err
			}
			_ = ex.Emit(ctx, TopicStepCompleted(), stepPayload(in, n, res.Steps))
		case NodeStep:
			name, _ := n["name"].(string)
			webhook, _ := n["webhook_url"].(string)
			if err := ex.Emit(ctx, TopicStepStarted(), stepPayload(in, n, res.Steps)); err != nil {
				return res, err
			}
			if webhook != "" {
				if err := ex.Webhook(ctx, webhook, map[string]any{
					"run_id": in.RunID, "code": in.Code, "step": name, "vars": in.Vars,
				}); err != nil {
					return res, fmt.Errorf("step %s webhook 失败: %w", name, err)
				}
			}
			_ = ex.Emit(ctx, TopicStepCompleted(), stepPayload(in, n, res.Steps))
		case NodeCondition:
			// 条件节点零副作用：只求值选路（确定性——expr 纯函数 + vars 为工作流参数）
		case NodeHuman:
			ref, err := ex.CreateHumanTask(ctx, n, in)
			if err != nil {
				return res, err
			}
			outcome, err := ex.WaitHumanTask(ctx, ref)
			if err != nil {
				return res, err
			}
			if err := ex.CompleteHumanTask(ctx, ref, outcome); err != nil {
				return res, err
			}
			if outcome.Action == "REJECT" {
				// 驳回：优先走 source_handle=reject 出边；否则流程以 REJECTED 终止
				if nid, ok := nextWithHandle(g, cur, "reject"); ok {
					res.Outcome = "REJECTED"
					cur = nid
					res.Steps++
					continue
				}
				res.Finished = true
				res.Outcome = "REJECTED"
				_ = ex.Emit(ctx, TopicRunCompleted(), map[string]any{
					"run_id": in.RunID, "def_id": in.DefID, "code": in.Code,
					"steps": res.Steps, "outcome": "REJECTED",
				})
				return res, nil
			}
		case NodeEmit:
			// 事件发布：subject 节点属性，payload 合并运行变量与节点 payload
			subject := nodeStr(n, "subject")
			if subject == "" {
				return res, fmt.Errorf("EMIT %s 缺少 subject", nodeID(n))
			}
			payload := map[string]any{"run_id": in.RunID, "vars": in.Vars}
			if raw, ok := n["payload"].(map[string]any); ok {
				for k, v := range raw {
					payload[k] = v
				}
			}
			if err := ex.EmitCustom(ctx, subject, payload); err != nil {
				return res, err
			}
		case NodeSet:
			// 变量设置：set 为字面量对象，合并进运行变量（确定性）
			raw, _ := n["set"].(map[string]any)
			for k, v := range raw {
				in.Vars[k] = v
			}
		case NodeSubflow:
			code := nodeStr(n, "code")
			if code == "" {
				return res, fmt.Errorf("SUBFLOW %s 缺少 code", nodeID(n))
			}
			subData, err := ex.LoadSubflowGraph(ctx, code)
			if err != nil {
				return res, fmt.Errorf("子流程 %s 加载失败: %w", code, err)
			}
			subGraph, err := Parse(subData)
			if err != nil {
				return res, fmt.Errorf("子流程 %s DSL 解析失败: %w", code, err)
			}
			subIn := RunInput{DefID: in.DefID, Code: code,
				RunID: fmt.Sprintf("%s-sub-%s", in.RunID, nodeID(n)),
				Graph: subData, Vars: in.Vars}
			if _, err := Run(ctx, subGraph, subIn, ex); err != nil {
				return res, fmt.Errorf("子流程 %s 执行失败: %w", code, err)
			}
		}
		res.Steps++
		next, err := nextID(g, cur, func(e string) bool { return expr.EvalBool(e, in.Vars) })
		if err != nil {
			return res, err
		}
		if next == "" {
			// 无 END 直达终点（设计缺陷宽容：视为结束）
			res.Finished = true
			if res.Outcome == "" {
				res.Outcome = "APPROVED"
			}
			_ = ex.Emit(ctx, TopicRunCompleted(), map[string]any{
				"run_id": in.RunID, "def_id": in.DefID, "code": in.Code,
				"steps": res.Steps, "outcome": res.Outcome,
			})
			return res, nil
		}
		cur = next
	}
	return res, fmt.Errorf("超过最大步数 %d（图可能成环）", MaxSteps)
}

func stepPayload(in RunInput, n map[string]any, idx int) map[string]any {
	name, _ := n["name"].(string)
	if name == "" {
		name, _ = n["type"].(string)
	}
	return map[string]any{
		"run_id": in.RunID, "def_id": in.DefID, "code": in.Code,
		"step": name, "node_id": nodeID(n), "index": idx, "vars": in.Vars,
	}
}

// ── local 驱动 StepExecutor（进程内 eventbus 直发；开发/降级/测试）────────────

// LocalExecutor local 实现。
type LocalExecutor struct{ EB eventbus.EventBus }

// Emit 发布事件。
func (l *LocalExecutor) Emit(ctx context.Context, topic string, payload map[string]any) error {
	if l.EB == nil {
		return nil
	}
	b, _ := json.Marshal(payload)
	return l.EB.Publish(ctx, topic, b)
}

// Webhook 本地实现直连 HTTP。
func (l *LocalExecutor) Webhook(ctx context.Context, url string, payload map[string]any) error {
	return postJSON(ctx, url, payload)
}

// Sleep 本地计时。
func (l *LocalExecutor) Sleep(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}

// DecodeInput 从 StartOptions.Input 解析运行输入。
func DecodeInput(input []byte) (*RunInput, *Graph, error) {
	var in RunInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, nil, fmt.Errorf("运行输入解析失败: %w", err)
	}
	g, err := Parse(in.Graph)
	if err != nil {
		return nil, nil, err
	}
	return &in, g, nil
}
