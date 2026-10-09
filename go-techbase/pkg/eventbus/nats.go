package eventbus

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// natsBus 基于 NATS JetStream 的事件总线（step1 生产实现，stacks/nats）。
//
// 语义：at-least-once —— JetStream stream 兜底捕获全部 subject（`>`），
// 订阅以 durable pull consumer 的 Consume 回调承载；Handler 返回 error 触发 Nak 重投。
// 消费方必须幂等（115 号 §4.2 / O-SYS 订阅纪律）。
type natsBus struct {
	conn   *nats.Conn
	js     jetstream.JetStream
	stream jetstream.Stream
	opts   Options
}

// NewNATS 连接 NATS 并确保 JetStream stream 存在（幂等）。
func NewNATS(opts Options) (EventBus, error) {
	if opts.URL == "" {
		return nil, fmt.Errorf("eventbus: nats driver 需要 URL")
	}
	nOpts := []nats.Option{nats.Name("go-techbase-eventbus")}
	if opts.Username != "" {
		nOpts = append(nOpts, nats.UserInfo(opts.Username, opts.Password))
	}
	if opts.ConnectWait == 0 {
		opts.ConnectWait = 5 * time.Second
	}
	nOpts = append(nOpts, nats.Timeout(opts.ConnectWait), nats.RetryOnFailedConnect(false))

	nc, err := nats.Connect(opts.URL, nOpts...)
	if err != nil {
		return nil, fmt.Errorf("eventbus: 连接 NATS %s 失败: %w", opts.URL, err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("eventbus: JetStream 上下文失败: %w", err)
	}
	name := opts.StreamName
	if name == "" {
		name = "OPIC"
	}
	maxAge := time.Duration(opts.MaxAgeDays) * 24 * time.Hour
	if maxAge == 0 {
		maxAge = 7 * 24 * time.Hour
	}
	// 主题域约定：OPIC 平台事件一律 opic.<域码>.<...>（避免 `>` 全捕获 JetStream 系统主题报 10052）
	subjects := opts.Subjects
	if len(subjects) == 0 {
		subjects = []string{"opic.>"} // 兜底：未指定前缀时保持全平台捕获（兼容旧部署）
	}
	stream, err := js.CreateStream(context.Background(), jetstream.StreamConfig{
		Name:      name,
		Subjects:  subjects,
		Retention: jetstream.LimitsPolicy,
		MaxAge:    maxAge,
	})
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("eventbus: 创建 stream %s 失败: %w", name, err)
	}
	return &natsBus{conn: nc, js: js, stream: stream, opts: opts}, nil
}

func (n *natsBus) Publish(ctx context.Context, subject string, payload []byte) error {
	if _, err := n.js.Publish(ctx, subject, payload); err != nil {
		return fmt.Errorf("eventbus: 发布 %s 失败: %w", subject, err)
	}
	return nil
}

func (n *natsBus) Subscribe(_ context.Context, subject, durable string, h Handler) (Subscription, error) {
	if durable == "" {
		durable = "eb-" + sanitize(subject)
	}
	cc := jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: subject,
		AckWait:       30 * time.Second,
	}
	cons, err := n.stream.CreateOrUpdateConsumer(context.Background(), cc)
	if err != nil {
		return nil, fmt.Errorf("eventbus: 创建 consumer %s 失败: %w", durable, err)
	}
	runCtx, cancel := context.WithCancel(context.Background())
	cch, err := cons.Consume(func(msg jetstream.Msg) {
		if err := h(runCtx, Message{Subject: msg.Subject(), Payload: msg.Data()}); err != nil {
			_ = msg.Nak()
			return
		}
		_ = msg.DoubleAck(runCtx)
	})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("eventbus: 启动消费失败: %w", err)
	}
	streamName := n.stream.CachedInfo().Config.Name
	return &natsSub{cancel: cancel, cons: cons, cch: cch, js: n.js, stream: streamName, durable: durable}, nil
}

type natsSub struct {
	cancel  context.CancelFunc
	cons    jetstream.Consumer
	cch     jetstream.ConsumeContext
	js      jetstream.JetStream
	stream  string
	durable string
}

func (s *natsSub) Unsubscribe() error {
	s.cancel()
	s.cch.Stop()
	ctx, c := context.WithTimeout(context.Background(), 5*time.Second)
	defer c()
	return s.js.DeleteConsumer(ctx, s.stream, s.durable)
}

func (n *natsBus) Close() error { n.conn.Drain(); return nil }

func sanitize(subject string) string {
	out := make([]byte, 0, len(subject))
	for i := 0; i < len(subject); i++ {
		c := subject[i]
		switch {
		case c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9':
			out = append(out, c)
		default:
			out = append(out, '-')
		}
	}
	return string(out)
}
