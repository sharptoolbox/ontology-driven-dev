package temporalflow

import (
	"context"
	"fmt"
	"sync"
)

// ── local 驱动人工任务（内存实现；测试/开发）────────────────────────────────

type localTask struct {
	ref  HumanTaskRef
	ch   chan HumanOutcome
	done bool
}

var (
	ltMu    sync.Mutex
	ltSeq   int64
	ltTasks = map[int64]*localTask{}
)

func (l *LocalExecutor) CreateHumanTask(_ context.Context, n map[string]any, in RunInput) (HumanTaskRef, error) {
	ltMu.Lock()
	defer ltMu.Unlock()
	ltSeq++
	ref := HumanTaskRef{ID: ltSeq, SignalName: fmt.Sprintf("tf-task-%d", ltSeq)}
	role, _ := n["role_ref"].(string)
	_ = role
	ltTasks[ltSeq] = &localTask{ref: ref, ch: make(chan HumanOutcome, 1)}
	return ref, nil
}

func (l *LocalExecutor) WaitHumanTask(_ context.Context, ref HumanTaskRef) (HumanOutcome, error) {
	ltMu.Lock()
	t := ltTasks[ref.ID]
	ltMu.Unlock()
	if t == nil {
		return HumanOutcome{}, fmt.Errorf("local human task %d 不存在", ref.ID)
	}
	o := <-t.ch
	t.done = true
	return o, nil
}

func (l *LocalExecutor) CompleteHumanTask(_ context.Context, ref HumanTaskRef, o HumanOutcome) error {
	return nil
}

func (l *LocalExecutor) EmitSLAExceeded(ctx context.Context, payload map[string]any) error {
	return l.Emit(ctx, TopicSLAExceeded(), payload)
}

// ApproveLocalTask 测试辅助：向内存任务投递审批结果。
func ApproveLocalTask(id int64, o HumanOutcome) error {
	ltMu.Lock()
	t := ltTasks[id]
	ltMu.Unlock()
	if t == nil {
		return fmt.Errorf("local human task %d 不存在", id)
	}
	t.ch <- o
	return nil
}

// EmitCustom EMIT 节点：local 直发。
func (l *LocalExecutor) EmitCustom(ctx context.Context, subject string, payload map[string]any) error {
	return l.Emit(ctx, subject, payload)
}

// LoadSubflowGraph local：从运行变量注入的 loader 不可用时返回明确错误（测试以单层为主）。
func (l *LocalExecutor) LoadSubflowGraph(_ context.Context, code string) ([]byte, error) {
	return nil, fmt.Errorf("local 驱动不支持子流程加载（code=%s）；如需子流程请使用 temporal 驱动", code)
}
