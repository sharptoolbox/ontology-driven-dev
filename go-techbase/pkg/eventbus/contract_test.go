package eventbus

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

// runContract 契约测试：对任意 EventBus 实现验证 Publish/Subscribe/通配/Close 语义。
// inproc 始终执行；nats 实现经同一套契约在 live 冒烟中执行（smoke 命令）。
func runContract(t *testing.T, eb EventBus) {
	t.Helper()
	ctx := context.Background()

	// ① 精确主题收发
	got := make(chan Message, 8)
	sub, err := eb.Subscribe(ctx, "test.contract.exact", "t-exact", func(_ context.Context, m Message) error {
		got <- m
		return nil
	})
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer sub.Unsubscribe()
	if err := eb.Publish(ctx, "test.contract.exact", []byte(`{"k":1}`)); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	select {
	case m := <-got:
		if m.Subject != "test.contract.exact" || string(m.Payload) != `{"k":1}` {
			t.Fatalf("消息不符: %+v", m)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("精确主题 5s 未收到消息")
	}

	// ② 通配符主题（* 单层）
	gotW := make(chan Message, 8)
	subW, err := eb.Subscribe(ctx, "test.contract.*.done", "t-wild", func(_ context.Context, m Message) error {
		gotW <- m
		return nil
	})
	if err != nil {
		t.Fatalf("Subscribe wild: %v", err)
	}
	defer subW.Unsubscribe()
	if err := eb.Publish(ctx, "test.contract.a1.done", []byte("w1")); err != nil {
		t.Fatalf("Publish wild: %v", err)
	}
	select {
	case m := <-gotW:
		if !strings.HasSuffix(m.Subject, ".a1.done") {
			t.Fatalf("通配命中主题不符: %s", m.Subject)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("通配主题 5s 未收到消息")
	}

	// ③ Handler 返回 error 不应崩溃（at-least-once 语义下由消费方重试，契约只验证不 panic）
	subE, err := eb.Subscribe(ctx, "test.contract.err", "t-err", func(_ context.Context, _ Message) error {
		return context.DeadlineExceeded
	})
	if err != nil {
		t.Fatalf("Subscribe err: %v", err)
	}
	defer subE.Unsubscribe()
	_ = eb.Publish(ctx, "test.contract.err", []byte("x"))

	// ④ 并发发布不竞争
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _ = eb.Publish(ctx, "test.contract.load", []byte("l")) }()
	}
	wg.Wait()
}
