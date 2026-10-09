package workflowx

import (
	"context"
	"fmt"

	"go.temporal.io/sdk/client"
	sdkworker "go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
	"go.temporal.io/sdk/activity"
)

// workerRunner Temporal worker 运行句柄（构造时创建唯一 worker 实例，
// Register/RegisterNamed/Run 全部作用于同一实例 —— 早期版本每次新建实例导致
// 注册落在丢弃对象上、Run 的 worker 零注册，已修正）。
type workerRunner struct {
	c         client.Client
	w         sdkworker.Worker
	taskQueue string
}

func (w *workerRunner) Register(fn any) {
	w.w.RegisterWorkflow(fn)
}

func (w *workerRunner) RegisterNamed(name string, fn any) {
	w.w.RegisterWorkflowWithOptions(fn, workflow.RegisterOptions{Name: name})
}

func (w *workerRunner) RegisterActivity(fn any) {
	w.w.RegisterActivity(fn)
}

func (w *workerRunner) RegisterActivityNamed(name string, fn any) {
	w.w.RegisterActivityWithOptions(fn, activity.RegisterOptions{Name: name})
}

func (w *workerRunner) Run(ctx context.Context) error {
	if err := w.w.Start(); err != nil {
		return fmt.Errorf("workflowx: worker 启动失败: %w", err)
	}
	<-ctx.Done()
	w.w.Stop()
	return nil
}

func (w *workerRunner) Close() { w.c.Close() }
