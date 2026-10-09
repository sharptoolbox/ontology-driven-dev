package eventbus

import (
	"context"
	"strings"
	"sync"
)

// inproc 进程内事件总线：零依赖默认实现（开发/降级兜底）。
// 语义：best-effort 同步直调 —— Publish 在发布方 goroutine 内逐个调用订阅者 Handler，
// 任一 Handler 返回 error 不影响其他订阅者，Publish 恒返回 nil。
// 通配支持与 NATS 一致：`*` 匹配单层 token，`>` 匹配剩余全部层级。
type inproc struct {
	mu   sync.RWMutex
	subs map[string]*inprocSub // key = subject pattern
}

type inprocSub struct {
	eb   *inproc
	pat  string
	h    Handler
	once sync.Once
}

// NewInproc 构造进程内实现。
func NewInproc() EventBus { return &inproc{subs: map[string]*inprocSub{}} }

func (i *inproc) Publish(_ context.Context, subject string, payload []byte) error {
	i.mu.RLock()
	handlers := make([]Handler, 0, len(i.subs))
	for _, s := range i.subs {
		if matchPattern(s.pat, subject) {
			handlers = append(handlers, s.h)
		}
	}
	i.mu.RUnlock()
	for _, h := range handlers {
		_ = h(context.Background(), Message{Subject: subject, Payload: payload})
	}
	return nil
}

func (i *inproc) Subscribe(_ context.Context, subject, _ string, h Handler) (Subscription, error) {
	s := &inprocSub{eb: i, pat: subject, h: h}
	i.mu.Lock()
	i.subs[subject+newSubKey()] = s
	i.mu.Unlock()
	return s, nil
}

func (s *inprocSub) Unsubscribe() error {
	s.once.Do(func() {
		s.eb.mu.Lock()
		for k, v := range s.eb.subs {
			if v == s {
				delete(s.eb.subs, k)
			}
		}
		s.eb.mu.Unlock()
	})
	return nil
}

func (i *inproc) Close() error { return nil }

// matchPattern NATS 风格通配：`*` 单层，`>` 收尾多层。
func matchPattern(pattern, subject string) bool {
	if pattern == subject {
		return true
	}
	pt := strings.Split(pattern, ".")
	st := strings.Split(subject, ".")
	for i, p := range pt {
		if p == ">" {
			return i < len(st) // `>` 须至少匹配一层
		}
		if i >= len(st) {
			return false
		}
		if p != "*" && p != st[i] {
			return false
		}
	}
	return len(pt) == len(st)
}

var subSeq int64

func newSubKey() string {
	subSeq++
	return "\x00" + itoa(subSeq)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	pos := len(b)
	for n > 0 {
		pos--
		b[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(b[pos:])
}
