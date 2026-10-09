package temporalflow

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
)

// 解释器 DSL/运行契约测试（TDD）：local 驱动执行四类节点 + 条件分支 + 死循环护栏。
// temporal 驱动复用同一 Run 骨架（Sleep/Emit/Webhook 原语换 temporal 实现），生产端到端另行验证。
func contractRun(t *testing.T, dsl string, vars map[string]any) ([]eventbus.Message, *RunResult) {
	t.Helper()
	eb := eventbus.NewInproc()
	got := make(chan eventbus.Message, 32)
	for _, topic := range []string{TopicStepStarted(), TopicStepCompleted(), TopicRunCompleted()} {
		topic := topic
		if _, err := eb.Subscribe(context.Background(), topic, "ct-"+topic, func(_ context.Context, m eventbus.Message) error {
			got <- m
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	in := RunInput{DefID: 1, Code: "ct", RunID: "run-1", Graph: json.RawMessage(dsl), Vars: vars}
	g, err := Parse(in.Graph)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	res, err := Run(context.Background(), g, in, &LocalExecutor{EB: eb})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	close(got)
	var msgs []eventbus.Message
	for m := range got {
		msgs = append(msgs, m)
	}
	return msgs, res
}

func TestSequentialSteps(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"a","type":"STEP","name":"准备"},
		{"id":"b","type":"STEP","name":"执行"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"a"},{"source":"a","target":"b"},{"source":"b","target":"e"}]}`
	msgs, res := contractRun(t, dsl, nil)
	if !res.Finished || res.Steps != 3 { // s(start 计一步) + a + b；END 不计
		t.Fatalf("steps=%d finished=%v", res.Steps, res.Finished)
	}
	topics := map[string]int{}
	for _, m := range msgs {
		topics[m.Subject]++
	}
	if topics[TopicStepStarted()] != 2 || topics[TopicStepCompleted()] != 2 || topics[TopicRunCompleted()] != 1 {
		t.Fatalf("事件计数不符: %v", topics)
	}
}

func TestConditionBranchTrue(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"c","type":"CONDITION","expr":"amount > 100"},
		{"id":"hi","type":"STEP","name":"高额"},
		{"id":"lo","type":"STEP","name":"低额"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"c"},
	          {"source":"c","target":"hi","source_handle":"true"},
	          {"source":"c","target":"lo","source_handle":"false"},
	          {"source":"hi","target":"e"},{"source":"lo","target":"e"}]}`
	msgs, res := contractRun(t, dsl, map[string]any{"amount": float64(500)})
	if !res.Finished {
		t.Fatal("应结束")
	}
	joined := ""
	for _, m := range msgs {
		joined += string(m.Payload)
	}
	if !contains(joined, "高额") || contains(joined, `"step":"低额"`) {
		t.Fatalf("应走 true 分支: %s", joined)
	}
}

func TestConditionBranchFalse(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"c","type":"CONDITION","expr":"amount > 100"},
		{"id":"hi","type":"STEP","name":"高额"},
		{"id":"lo","type":"STEP","name":"低额"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"c"},
	          {"source":"c","target":"hi","source_handle":"true"},
	          {"source":"c","target":"lo","source_handle":"false"},
	          {"source":"hi","target":"e"},{"source":"lo","target":"e"}]}`
	_, res := contractRun(t, dsl, map[string]any{"amount": float64(10)})
	if !res.Finished {
		t.Fatal("应结束")
	}
}

func TestTimerMilli(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"w","type":"TIMER","seconds":0.001,"name":"短暂等待"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"w"},{"source":"w","target":"e"}]}`
	start := time.Now()
	_, res := contractRun(t, dsl, nil)
	if !res.Finished {
		t.Fatal("应结束")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("timer 未按毫秒级执行")
	}
}

func TestParseErrors(t *testing.T) {
	if _, err := Parse([]byte(`{"nodes":[{"id":"a","type":"STEP"}],"edges":[]}`)); err == nil {
		t.Fatal("无 START 应报错")
	}
	if _, err := Parse([]byte(`{"nodes":[{"id":"s","type":"START"}],"edges":[]}`)); err == nil {
		t.Fatal("无 END 应报错")
	}
	if _, err := Parse([]byte(`{"nodes":[{"id":"s","type":"WARP"}],"edges":[]}`)); err == nil {
		t.Fatal("未知类型应报错")
	}
}

func TestMissingBranch(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"c","type":"CONDITION","expr":"x > 1"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"c"},{"source":"c","target":"e","source_handle":"true"}]}`
	in := RunInput{RunID: "r", Graph: json.RawMessage(dsl), Vars: map[string]any{"x": float64(0)}}
	g, _ := Parse(in.Graph)
	_, err := Run(context.Background(), g, in, &LocalExecutor{})
	if err == nil || !contains(err.Error(), "缺少 false 分支") {
		t.Fatalf("应报缺 false 分支: %v", err)
	}
}

func TestLoopGuard(t *testing.T) {
	dsl := `{"nodes":[
		{"id":"s","type":"START"},
		{"id":"a","type":"STEP","name":"循环"},
		{"id":"e","type":"END"}],
	 "edges":[{"source":"s","target":"a"},{"source":"a","target":"a"},{"source":"a","target":"e"}]}`
	in := RunInput{RunID: "r", Graph: json.RawMessage(dsl)}
	g, _ := Parse(in.Graph)
	_, err := Run(context.Background(), g, in, &LocalExecutor{})
	if err == nil || !contains(err.Error(), "最大步数") {
		t.Fatalf("应触发循环护栏: %v", err)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
