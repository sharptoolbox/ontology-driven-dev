package workflowx

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestLocalLifecycle(t *testing.T) {
	c := NewLocal()
	ctx := context.Background()

	// ① 成功路径
	info, err := c.Start(ctx, "demo", func(context.Context, []byte) error { return nil },
		StartOptions{ID: "wf-ok", Input: []byte("{}")})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if info.ID != "wf-ok" || info.Status != StatusRunning {
		t.Fatalf("启动信息不符: %+v", info)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		st, _ := c.Status(ctx, "wf-ok")
		if st.Status == StatusDone {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("3s 未完成: %+v", st)
		}
		time.Sleep(20 * time.Millisecond)
	}

	// ② 失败路径
	_, _ = c.Start(ctx, "demo", func(context.Context, []byte) error { return errors.New("boom") },
		StartOptions{ID: "wf-bad"})
	for {
		st, _ := c.Status(ctx, "wf-bad")
		if st.Status == StatusFailed {
			if st.Error != "boom" {
				t.Fatalf("失败原因不符: %+v", st)
			}
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	// ③ 取消路径
	block := make(chan struct{})
	_, _ = c.Start(ctx, "demo", func(c context.Context, _ []byte) error {
		<-c.Done()
		return c.Err()
	}, StartOptions{ID: "wf-cancel"})
	_ = c.Cancel(ctx, "wf-cancel")
	for {
		st, _ := c.Status(ctx, "wf-cancel")
		if st.Status == StatusCanceled {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	close(block)

	// ④ 不存在
	if _, err := c.Status(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("应返回 ErrNotFound, got %v", err)
	}
	if err := c.Cancel(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cancel 应 ErrNotFound, got %v", err)
	}

	// ⑤ ID 幂等冲突
	if _, err := c.Start(ctx, "demo", func(context.Context, []byte) error { return nil },
		StartOptions{ID: "wf-ok"}); err == nil {
		t.Fatal("重复 ID 应报错")
	}

	// ⑥ nil 函数
	if _, err := c.Start(ctx, "demo", nil, StartOptions{ID: "wf-nil"}); err == nil {
		t.Fatal("local driver nil fn 应报错")
	}
}

func TestNewUnknownDriver(t *testing.T) {
	if _, err := New(Options{Driver: "cadence"}); err == nil {
		t.Fatal("未知 driver 应报错")
	}
}
