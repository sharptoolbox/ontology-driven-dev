// temporal worker 装配：flowGuardian 看护工作流的 temporal 版实现。
//
// temporal workflow 必须确定性 —— 计时用 workflow.Sleep（服务端持久化定时器，
// 进程重启不丢），不做任何本地 IO；SLA 到期后工作流完成，
// SLA 事件由 engine 的监听 goroutine 轮询 Status 后发布（见 flow_guardian.go）。
package infra

import (
	"os"
	"encoding/json"
	"time"

	"go.temporal.io/sdk/workflow"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/temporalflow"
)

// TemporalGuardianWorkflow flowGuardian 的 temporal 实现（装配层经 RegisterNamed("flowGuardian", ...) 注册）。
// 输入：JSON 编码的 time.Duration（纳秒）。
func TemporalGuardianWorkflow(ctx workflow.Context, input []byte) error {
	var sla time.Duration
	_ = json.Unmarshal(input, &sla)
	if sla <= 0 {
		sla = 48 * time.Hour
	}
	return workflow.Sleep(ctx, sla)
}

// RegisterTemporalFlows 把全部工作流/活动注册到 runner（flowGuardian + 解释器 + IO 原语）。
func RegisterTemporalFlows(runner WorkerRunner) {
	runner.RegisterNamed("flowGuardian", TemporalGuardianWorkflow)
	runner.RegisterNamed("temporalInterpreter", temporalflow.TemporalInterpreterWorkflow)
	runner.RegisterActivityNamed("EmitEventActivity", temporalflow.EmitEventActivity)
	runner.RegisterActivityNamed("WebhookActivity", temporalflow.WebhookActivity)
	runner.RegisterActivityNamed("tf.CreateHumanTask", TFCreateHumanTask)
	runner.RegisterActivityNamed("tf.CompleteHumanTask", TFCompleteHumanTask)
	runner.RegisterActivityNamed("tf.EmitSLAExceededActivity", TFEmitSLAExceededActivity)
	runner.RegisterActivityNamed("tf.CreateRun", TFCreateRun)
	runner.RegisterActivityNamed("tf.CompleteRun", TFCompleteRun)
}

// ── 内部辅助（tf 活动用）─────────────────────────────────────────────────────

func toI64Any(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int32:
		return int64(x)
	case int16:
		return int64(x)
	case int:
		return int64(x)
	case float64:
		return int64(x)
	}
	return 0
}

func trimSpaceAny(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return ""
}

func envOrInf(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
