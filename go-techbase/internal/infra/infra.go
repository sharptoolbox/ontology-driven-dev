// Package infra —— step1 基础设施客户端单例（eventbus / workflowx）。
//
// 装配关系：cmd/techbase 启动时 Init(config)；service 层经 EB()/WF() 取用，
// 构造 engine.NewWithInfra。任一基础设施不可用 → 降级为 nil（纯 v1 行为），
// 与「第 3 层可替换、不可用即降级」纪律一致。
package infra

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/opic-ai/ontology-driven-dev/go-techbase/internal/config"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/eventbus"
	"github.com/opic-ai/ontology-driven-dev/go-techbase/pkg/workflowx"
)

var (
	mu   sync.RWMutex
	eb   eventbus.EventBus
	wf   workflowx.Client
	temporalDriver bool
)

// Init 初始化事件总线与工作流客户端（幂等；失败降级 nil 并记日志）。
func Init() {
	mu.Lock()
	defer mu.Unlock()
	if eb == nil {
		c := config.Config.EventBus
		streamName := c.StreamName
		if streamName == "" {
			streamName = "OPIC_" + strings.ToUpper(config.Config.CenterCode)
		}
		subjects := []string{fmt.Sprintf("opic.%s.>", config.Config.CenterCode)}
		if c.SubjectPrefix != "" {
			subjects = []string{strings.TrimSuffix(c.SubjectPrefix, ".") + ".>"}
		}
		client, err := eventbus.New(eventbus.Options{
			Driver: c.Driver, URL: c.URL, Username: c.Username, Password: c.Password,
			StreamName: streamName, Subjects: subjects, MaxAgeDays: c.MaxAgeDays,
		})
		if err != nil {
			log.Printf("[infra] eventbus(%s) 初始化失败，事件发布降级为无: %v", c.Driver, err)
		} else {
			eb = client
			log.Printf("[infra] eventbus(%s) 就绪", c.Driver)
		}
	}
	if wf == nil {
		c := config.Config.Workflow
		tq := c.TaskQueue
		if tq == "" {
			tq = config.Config.CenterCode
		}
		client, err := workflowx.New(workflowx.Options{Driver: c.Driver, Address: c.Address, Namespace: c.Namespace, TaskQueue: tq})
		if err != nil {
			log.Printf("[infra] workflow(%s) 初始化失败，看护降级为无: %v", c.Driver, err)
		} else {
			wf = client
			temporalDriver = strings.EqualFold(c.Driver, "temporal")
			log.Printf("[infra] workflow(%s) 就绪", c.Driver)
		}
	}
}

// EB 事件总线（可能为 nil = 降级）。
func EB() eventbus.EventBus { mu.RLock(); defer mu.RUnlock(); return eb }

// WF 工作流客户端（可能为 nil = 降级）。
func WF() workflowx.Client { mu.RLock(); defer mu.RUnlock(); return wf }

// TemporalDriver 当前工作流驱动是否 temporal。
func TemporalDriver() bool { mu.RLock(); defer mu.RUnlock(); return temporalDriver }

// SLAHours 流程任务看护时限（env FLOW_SLA_HOURS 覆盖，默认 48）。
func SLAHours() float64 {
	if v := os.Getenv("FLOW_SLA_HOURS"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
		}
	}
	return 48
}

// Close 释放客户端（graceful 注册用；幂等）。
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if eb != nil {
		_ = eb.Close()
		eb = nil
	}
	if wf != nil {
		_ = wf.Close()
		wf = nil
	}
}

// NewTemporalWorker 构造 flowGuardian 的 temporal worker 运行句柄。
func NewTemporalWorker(address, namespace string) (WorkerRunner, error) {
	tq := config.Config.Workflow.TaskQueue
	if tq == "" {
		tq = config.Config.CenterCode
	}
	return workflowx.NewWorkerRunner(workflowx.Options{Driver: "temporal", Address: address, Namespace: namespace, TaskQueue: tq}, tq)
}

// WorkerRunner worker 运行句柄（透传 workflowx）。
type WorkerRunner = workflowx.WorkerRunner
