// Package temporalflow —— Temporal 流程设计器（DSL + 解释器工作流）。
//
// 语义（对齐 115 号 §4.2 与用户指令 2026-10-02「流程设计改为对 Temporal 流程进行设计」）：
// 设计器产出**编排 DSL**（节点图 JSON，存 flow_definition.node_graph，flow_type='TEMPORAL'），
// 由通用**解释器工作流**在 Temporal 按设计执行——编排即数据，Temporal 承担持久化/
// 重放/定时器；每步执行经 Activity（发 step 事件到事件总线 + 可选 webhook 回调）。
//
// DSL 图 schema（node_graph 字段，兼容 xyflow 存储形态）:
//
//	{"nodes":[
//	  {"id":"n1","type":"START"},
//	  {"id":"n2","type":"STEP","name":"通知","webhook_url":"http://..."},
//	  {"id":"n3","type":"TIMER","seconds":30},
//	  {"id":"n4","type":"CONDITION","expr":"amount > 100"},
//	  {"id":"n5","type":"END"}],
//	 "edges":[{"source":"n1","target":"n2"},
//	          {"source":"n4","target":"n5","source_handle":"true"}]}
//
// 条件分支：CONDITION 节点对启动变量求 EvalBool(expr, vars)，按结果走
// source_handle='true'/'false' 的出边（缺该分支视为设计错误）。
package temporalflow

import (
	"encoding/json"
	"fmt"
)

// 节点类型。
const (
	NodeStart     = "START"
	NodeStep      = "STEP"
	NodeTimer     = "TIMER"
	NodeCondition = "CONDITION"
	NodeHuman     = "HUMAN" // 人工审批任务：创建待办并等待 Signal 审批结果
	NodeEmit      = "EMIT"  // 事件发布：向指定主题发事件（行为调用的第 3 层实现）
	NodeSet       = "SET"   // 变量设置：合并字面量到运行变量（纯函数，确定性）
	NodeSubflow   = "SUBFLOW" // 子流程：按 code 加载另一 TEMPORAL 定义并执行
	NodeEnd       = "END"
)

// 条件分支 handle 约定。
const (
	HandleTrue  = "true"
	HandleFalse = "false"
)

// 防图死循环护栏。
const MaxSteps = 1000

// Graph 编排 DSL 图。
type Graph struct {
	Nodes []map[string]any `json:"nodes"`
	Edges []Edge           `json:"edges"`
}

// Edge 有向边（CONDITION 出边带 source_handle=true/false）。
type Edge struct {
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"source_handle,omitempty"`
}

// Parse 解析并校验 DSL（唯一 START、存在 END、条件出边合法）。
func Parse(data []byte) (*Graph, error) {
	var g Graph
	if err := json.Unmarshal(data, &g); err != nil {
		return nil, fmt.Errorf("DSL 解析失败: %w", err)
	}
	starts := 0
	ends := 0
	for _, n := range g.Nodes {
		switch nodeType(n) {
		case NodeStart:
			starts++
		case NodeEnd:
			ends++
		case NodeTimer, NodeStep, NodeCondition, NodeHuman, NodeEmit, NodeSet, NodeSubflow:
		default:
			return nil, fmt.Errorf("未知节点类型: %v", nodeType(n))
		}
	}
	if starts != 1 {
		return nil, fmt.Errorf("DSL 须恰有一个 START 节点（当前 %d）", starts)
	}
	if ends < 1 {
		return nil, fmt.Errorf("DSL 缺少 END 节点")
	}
	for _, e := range g.Edges {
		if e.Source == "" || e.Target == "" {
			return nil, fmt.Errorf("边缺失 source/target")
		}
	}
	return &g, nil
}

// nodeType 取节点类型。
func nodeType(n map[string]any) string {
	t, _ := n["type"].(string)
	return t
}

// nodeID 取节点 ID。
func nodeID(n map[string]any) string {
	id, _ := n["id"].(string)
	return id
}

// nodeById ID → 节点。
func nodeById(g *Graph, id string) map[string]any {
	for _, n := range g.Nodes {
		if nodeID(n) == id {
			return n
		}
	}
	return nil
}

// nextID 求后继：普通节点取第一条出边；条件节点按 EvalBool(expr, 运行时变量) 取 handle 边。
// 返回 (后继 ID, error)。END 无后继返回 ("", nil)。
func nextID(g *Graph, id string, evalBool func(expr string) bool) (string, error) {
	n := nodeById(g, id)
	if n == nil {
		return "", fmt.Errorf("节点 %s 不存在", id)
	}
	switch nodeType(n) {
	case NodeEnd:
		return "", nil
	case NodeCondition:
		expr, _ := n["expr"].(string)
		want := HandleFalse
		if evalBool(expr) {
			want = HandleTrue
		}
		for _, e := range g.Edges {
			if e.Source == id && e.SourceHandle == want {
				return e.Target, nil
			}
		}
		return "", fmt.Errorf("CONDITION %s 缺少 %s 分支出边", id, want)
	default:
		for _, e := range g.Edges {
			if e.Source == id {
				return e.Target, nil
			}
		}
		return "", fmt.Errorf("节点 %s 无出边（流程中断）", id)
	}
}

// nextWithHandle 按显式 handle 取后继（HUMAN 驳回分支用）。无该边返回 ("", false)。
func nextWithHandle(g *Graph, id, handle string) (string, bool) {
	for _, e := range g.Edges {
		if e.Source == id && e.SourceHandle == handle {
			return e.Target, true
		}
	}
	return "", false
}

// nodeStr 取字符串字段。
func nodeStr(n map[string]any, key string) string {
	v, _ := n[key].(string)
	return v
}

// startID 求 START 节点 ID。
func startID(g *Graph) (string, error) {
	for _, n := range g.Nodes {
		if nodeType(n) == NodeStart {
			return nodeID(n), nil
		}
	}
	return "", fmt.Errorf("缺少 START")
}
