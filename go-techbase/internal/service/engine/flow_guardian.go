package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/workflowx"
)

// 流程 SLA 看护 —— flow 引擎 × step1 工作流（pkg/workflowx）。
//
// 语义（对齐 115 号 §4.2「编排结构语义在域内，Temporal 只承担跑」）：
// 人工审批的流转语义（Start/Approve/网关路由）保留在 flow_engine；
// workflowx 承担**运行时看护**：任务创建时启动 SLA 看护工作流，到期未处理则
// 发布 sla.exceeded 事件；任务完成/实例结束时取消。
//
// driver=temporal：计时落在 Temporal Server（服务端持久化，进程重启不丢）；
// driver=local：进程内 goroutine 计时（开发/降级）。两驱动同一接口。
// 事件发布由本进程的监听 goroutine 在看护工作流完成后执行 —— 保持
// temporal 工作流函数确定性（纯计时，不做 IO）。

// GuardianWorkflowFunc 看护工作流函数（local 驱动直用；temporal 由装配层以
// workflow.Sleep 等价实现注册为 "flowGuardian"，语义一致：到期完成/取消退出）。
func GuardianWorkflowFunc(ctx context.Context, input []byte) error {
	var sla time.Duration
	_ = json.Unmarshal(input, &sla)
	if sla <= 0 {
		sla = 48 * time.Hour
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(sla):
		return nil
	}
}

// startGuardian 启动看护（旁路：失败仅记日志，不阻塞审批）。
func (e *Engine) startGuardian(instanceID, taskID int64, title string) {
	if e.WF == nil {
		return
	}
	sla := time.Duration(e.SLAHours * float64(time.Hour))
	if sla <= 0 {
		sla = 48 * time.Hour
	}
	input, _ := json.Marshal(sla)
	info, err := e.WF.Start(context.Background(), "flowGuardian", GuardianWorkflowFunc, workflowx.StartOptions{
		ID:            guardianID(taskID),
		Input:         input,
		Timeout:       sla + time.Minute,
		RunTimeoutSec: int((sla + time.Minute).Seconds()),
	})
	if err != nil {
		log.Printf("[flow-guardian] 启动失败 task=%d: %v（看护降级为无）", taskID, err)
		return
	}
	go func() {
		deadline := time.Now().Add(sla + 10*time.Minute)
		for {
			// 先查后等：极短 SLA 也要首查即中
			st, err := e.WF.Status(context.Background(), info.ID)
			if err != nil {
				return // 已取消（任务处理完成）或查询失败
			}
			switch st.Status {
			case workflowx.StatusDone:
				e.publish(TopicSLAExceeded(), map[string]any{
					"instance_id": instanceID, "task_id": taskID,
					"task_title": title, "sla_hours": e.SLAHours,
				})
				return
			case workflowx.StatusCanceled, workflowx.StatusFailed:
				return
			}
			if time.Now().After(deadline) {
				return
			}
			time.Sleep(e.pollInterval())
		}
	}()
}

// cancelGuardian 取消看护（任务已处理）。
func (e *Engine) cancelGuardian(taskID int64) {
	if e.WF == nil {
		return
	}
	if err := e.WF.Cancel(context.Background(), guardianID(taskID)); err != nil && err != workflowx.ErrNotFound {
		log.Printf("[flow-guardian] 取消失败 task=%d: %v", taskID, err)
	}
}

func (e *Engine) pollInterval() time.Duration {
	if e.PollInterval > 0 {
		return e.PollInterval
	}
	if e.TemporalDriver {
		return 60 * time.Second
	}
	return 5 * time.Second
}

// guardianID 工作流实例 ID（任务唯一，幂等键）。
func guardianID(taskID int64) string {
	return fmt.Sprintf("flowGuardian-task-%d", taskID)
}
