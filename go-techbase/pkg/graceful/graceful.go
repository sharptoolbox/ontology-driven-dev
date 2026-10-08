// Package graceful —— 优雅退出(gopherforge shared/pkg/graceful 模式:LIFO 注册关闭钩子)。
package graceful

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// Shutdowner 优雅退出管理器。
type Shutdowner struct {
	mu      sync.Mutex
	hooks   []hook
	timeout time.Duration
}

type hook struct {
	name string
	fn   func(ctx context.Context) error
}

// New 创建(默认 10s 退出超时)。
func New(timeout time.Duration) *Shutdowner {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &Shutdowner{timeout: timeout}
}

// Register 注册关闭钩子(LIFO 执行)。
func (s *Shutdowner) Register(name string, fn func(ctx context.Context) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hooks = append(s.hooks, hook{name: name, fn: fn})
}

// WaitAndShutdown 阻塞直至收到 SIGINT/SIGTERM,然后 LIFO 执行钩子。
func (s *Shutdowner) WaitAndShutdown() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	sig := <-ch
	println("[graceful] 收到信号", sig.String(), ",开始优雅退出")
	s.mu.Lock()
	hooks := append([]hook(nil), s.hooks...)
	s.mu.Unlock()
	for i := len(hooks) - 1; i >= 0; i-- {
		h := hooks[i]
		ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
		if err := h.fn(ctx); err != nil {
			println("[graceful] 关闭", h.name, "失败:", err.Error())
		} else {
			println("[graceful] 已关闭", h.name)
		}
		cancel()
	}
}
