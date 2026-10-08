package engine

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/workflowx"
)

// TestFlowEventsPublish 事件经 inproc 总线可收到（主题/payload 契约）。
func TestFlowEventsPublish(t *testing.T) {
	eb := eventbus.NewInproc()
	got := make(chan eventbus.Message, 4)
	for _, topic := range []string{TopicInstanceStarted(), TopicTaskCreated(), TopicInstanceDone(), TopicSLAExceeded()} {
		topic := topic
		if _, err := eb.Subscribe(context.Background(), topic, "t-"+topic, func(_ context.Context, m eventbus.Message) error {
			got <- m
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	e := &Engine{EB: eb}
	e.publish(TopicInstanceStarted(), map[string]any{"instance_id": int64(7)})
	select {
	case m := <-got:
		if m.Subject != TopicInstanceStarted() {
			t.Fatalf("主题不符: %s", m.Subject)
		}
		var p map[string]any
		if err := json.Unmarshal(m.Payload, &p); err != nil || p["instance_id"].(float64) != 7 {
			t.Fatalf("payload 不符: %s", m.Payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("未收到事件")
	}
	// nil EB 不 panic
	(&Engine{}).publish(TopicTaskCreated(), nil)
}

// TestGuardianLocalLifecycle local 看护：SLA 到期 → sla.exceeded 事件；取消 → 不事件化。
func TestGuardianLocalLifecycle(t *testing.T) {
	eb := eventbus.NewInproc()
	slaGot := make(chan eventbus.Message, 4)
	if _, err := eb.Subscribe(context.Background(), TopicSLAExceeded(), "t-sla", func(_ context.Context, m eventbus.Message) error {
		slaGot <- m
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	wf := workflowx.NewLocal()
	e := &Engine{EB: eb, WF: wf, SLAHours: 0.000001, PollInterval: 20 * time.Millisecond} // ≈3.6ms
	e.startGuardian(1, 100, "测试任务")
	select {
	case m := <-slaGot:
		var p map[string]any
		_ = json.Unmarshal(m.Payload, &p)
		if p["task_id"].(float64) != 100 {
			t.Fatalf("payload 不符: %s", m.Payload)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("SLA 到期未收到事件")
	}

	// 取消路径：先取消再不起事件（短 SLA 也不会到）
	e2 := &Engine{EB: eb, WF: workflowx.NewLocal(), SLAHours: 0.000001, PollInterval: 20 * time.Millisecond}
	e2.startGuardian(2, 200, "将取消")
	_ = e2.WF.Cancel(context.Background(), guardianID(200))
	time.Sleep(200 * time.Millisecond)
	select {
	case m := <-slaGot:
		var p map[string]any
		_ = json.Unmarshal(m.Payload, &p)
		if p["task_id"].(float64) == 200 {
			t.Fatal("已取消的看护不应发布 SLA 事件")
		}
	case <-time.After(500 * time.Millisecond):
	}
}

// TestGuardianNilDeps nil 依赖零 panic（纯 v1 行为降级）。
func TestGuardianNilDeps(t *testing.T) {
	e := &Engine{}
	e.startGuardian(1, 1, "x")
	e.cancelGuardian(1)
	e.publish(TopicInstanceDone(), nil)
}
