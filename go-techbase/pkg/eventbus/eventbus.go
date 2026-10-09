// Package eventbus —— 事件总线统一接口（OPIC step1 基础设施集成）。
//
// 对应 O-SYS 事件总线的第 3 层可替换实现（115 号 S8 / opic-deploy stacks/nats）：
//
//	driver=inproc  进程内实现（默认，零依赖，单机开发与降级兜底）
//	driver=nats    NATS JetStream（生产；opic-net 内 nats:4222 或宿主映射端口）
//
// 投递语义：NATS 实现为 at-least-once（JetStream durable consumer），消费方必须幂等；
// inproc 为 best-effort（进程内直调，无持久化）。事件编目（EventType/EventSubscription）
// 的语义权威在 O-SYS 能力中心，本包只承担传输。
package eventbus

import (
	"context"
	"errors"
	"time"
)

// Message 事件信封：subject 为主题（O-SYS 事件类型编目命名），payload 为 JSON 字节。
// 主题域约定：OPIC 平台事件一律 `opic.<域码>.<...>`（如 opic.sys.user.created）——
// JetStream stream OPIC 以 `opic.>` 捕获（`>` 全捕获会被服务端拒绝）。
type Message struct {
	Subject string
	Payload []byte
}

// Handler 订阅回调；返回 error 触发 NATS 实现的 Nak 重投（at-least-once）。
type Handler func(ctx context.Context, msg Message) error

// Subscription 订阅句柄；Unsubscribe 释放订阅（NATS 端同时删除 durable consumer）。
type Subscription interface {
	Unsubscribe() error
}

// EventBus 事件总线统一接口。
type EventBus interface {
	// Publish 发布事件。NATS：发布到 subject（JetStream stream 按 subject 兜底捕获）。
	Publish(ctx context.Context, subject string, payload []byte) error
	// Subscribe 订阅主题（支持 `*`/`>` 通配，NATS 语义）。durable 为持久订阅名（NATS）。
	Subscribe(ctx context.Context, subject, durable string, h Handler) (Subscription, error)
	// Close 释放连接（幂等）。
	Close() error
}

// 配置（来自 internal/config.EventBus；构造函数按 driver 分派）。
type Options struct {
	Driver   string // inproc | nats
	URL      string // nats://host:port
	Username string
	Password string
	// NATS JetStream 参数
	StreamName  string // 默认 OPIC_<CenterCode>（中心级隔离，经 internal/config 派生）
	Subjects    []string // stream 捕获的主题域，默认 ["opic.<CenterCode>.>"]
	MaxAgeDays  int    // 事件保留天数，默认 7
	ConnectWait time.Duration
}

var ErrClosed = errors.New("eventbus: closed")

// New 按 Options.Driver 构造实现（默认 inproc）。
func New(opts Options) (EventBus, error) {
	switch opts.Driver {
	case "", "inproc":
		return NewInproc(), nil
	case "nats":
		return NewNATS(opts)
	default:
		return nil, errors.New("eventbus: 未知 driver " + opts.Driver + "（支持 inproc|nats）")
	}
}
