// Package workflowx —— 工作流执行统一接口（OPIC step1 基础设施集成）。
//
// 对应 O-SYS 流程引擎运行承载的第 3 层可替换实现（115 号 S8 / opic-deploy stacks/temporal）：
//
//	driver=local     进程内实现（默认，零依赖；编排结构合法性仍归 O-APP/O-SYS 语义）
//	driver=temporal  Temporal Server（生产；opic-net 内 temporal:7233 或宿主映射端口）
//
// 编排**结构**语义（WorkflowDefinition / INV-45·47）在能力中心域内；
// 本包只承担「跑」：启动、查询状态、取消。业务命名空间默认 opic
// （stacks/temporal post-install 创建，retention 30 天）。
package workflowx

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// 状态常量（跨驱动统一口径）。
const (
	StatusRunning = "running"
	StatusDone    = "done"
	StatusFailed  = "failed"
	StatusCanceled = "canceled"
	StatusUnknown = "unknown"
)

// StartOptions 启动参数。ID 为业务工作流实例 ID（幂等键：Temporal 同 ID 并发启动被拒）。
type StartOptions struct {
	ID            string
	Input         []byte            // JSON 输入，作为唯一参数传给工作流函数
	Timeout       time.Duration     // local 生效；temporal 用 WorkflowExecutionTimeout
	TaskQueue     string            // temporal 生效，默认 techbase
	RunTimeoutSec int               // temporal 生效，默认 3600
}

// RunInfo 执行信息。
type RunInfo struct {
	ID     string // 工作流实例 ID
	RunID  string // temporal 运行 ID（local 为空）
	Status string
	Error  string // 失败原因（Status=failed 时）
}

// Client 工作流客户端统一接口。
type Client interface {
	// Start 启动工作流。fn 为 local 实现所需的函数（temporal 忽略 fn，按 name 调度）。
	Start(ctx context.Context, name string, fn WorkflowFunc, opts StartOptions) (RunInfo, error)
	// Status 查询执行状态。
	Status(ctx context.Context, id string) (RunInfo, error)
	// Cancel 取消执行。
	Cancel(ctx context.Context, id string) error
	// Close 释放连接（幂等）。
	Close() error
}

// WorkflowFunc 工作流函数：接收 JSON 输入，返回 error 即失败。
type WorkflowFunc func(ctx context.Context, input []byte) error

// Options 配置（internal/config.Workflow）。
type Options struct {
	Driver    string // local | temporal
	Address   string // temporal frontend（host:port）
	Namespace string // 默认 opic
	TaskQueue string // 默认 = CENTER_CODE（中心级隔离）
}

var ErrNotFound = errors.New("workflowx: 执行不存在")

// New 按 Options.Driver 构造实现（默认 local）。
func New(opts Options) (Client, error) {
	switch opts.Driver {
	case "", "local":
		return NewLocal(), nil
	case "temporal":
		return NewTemporal(opts)
	default:
		return nil, fmt.Errorf("workflowx: 未知 driver %s（支持 local|temporal）", opts.Driver)
	}
}

// ── local 实现 ────────────────────────────────────────────────────────────────

type run struct {
	info   RunInfo
	cancel context.CancelFunc
}

// localClient 进程内工作流执行：goroutine 直调 WorkflowFunc，内存跟踪状态。
type localClient struct {
	mu   sync.RWMutex
	runs map[string]*run
}

// NewLocal 构造进程内实现。
func NewLocal() Client { return &localClient{runs: map[string]*run{}} }

func (l *localClient) Start(_ context.Context, name string, fn WorkflowFunc, opts StartOptions) (RunInfo, error) {
	if fn == nil {
		return RunInfo{}, errors.New("workflowx: local driver 需要非 nil 的 WorkflowFunc")
	}
	if opts.ID == "" {
		opts.ID = fmt.Sprintf("%s-%d", name, time.Now().UnixNano())
	}
	l.mu.Lock()
	if _, ok := l.runs[opts.ID]; ok {
		l.mu.Unlock()
		return RunInfo{}, fmt.Errorf("workflowx: 工作流 %s 已存在（ID 幂等键冲突）", opts.ID)
	}
	runCtx, cancel := context.WithCancel(context.Background())
	if opts.Timeout > 0 {
		runCtx, cancel = context.WithTimeout(runCtx, opts.Timeout)
	}
	r := &run{info: RunInfo{ID: opts.ID, Status: StatusRunning}, cancel: cancel}
	l.runs[opts.ID] = r
	l.mu.Unlock()

	go func() {
		err := fn(runCtx, opts.Input)
		l.mu.Lock()
		defer l.mu.Unlock()
		switch {
		case err == nil:
			r.info.Status = StatusDone
		case errors.Is(err, context.Canceled):
			r.info.Status = StatusCanceled
		default:
			r.info.Status = StatusFailed
			r.info.Error = err.Error()
		}
	}()
	return r.info, nil
}

func (l *localClient) Status(_ context.Context, id string) (RunInfo, error) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	r, ok := l.runs[id]
	if !ok {
		return RunInfo{}, ErrNotFound
	}
	return r.info, nil
}

func (l *localClient) Cancel(_ context.Context, id string) error {
	l.mu.RLock()
	r, ok := l.runs[id]
	l.mu.RUnlock()
	if !ok {
		return ErrNotFound
	}
	r.cancel()
	return nil
}

func (l *localClient) Close() error { return nil }
