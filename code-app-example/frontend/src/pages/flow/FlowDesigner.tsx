import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactFlow, {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, Position,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { ArrowLeft, Plus, Rocket, Save, Trash2 } from 'lucide-react'
import { flowApi } from '../../api/flow'
import { metaApi, type Rule } from '../../api/meta'
import { toast } from '../../components/toast'
import { flowNodeTypeLabel } from '../../utils/status'

const KINDS = ['start', 'end', 'user_task', 'approval_task', 'system_task', 'behavior_call', 'sub_flow_call', 'gateway'] as const

const KIND_COLOR: Record<string, string> = {
  start: '#16a34a',
  end: '#ef4444',
  user_task: '#2266e3',
  approval_task: '#f59e0b',
  system_task: '#8b5cf6',
  behavior_call: '#0ea5e9',
  sub_flow_call: '#14b8a6',
  gateway: '#f43f5e',
}

function DiamondNode({ data }: NodeProps<NodeData>) {
  return (
    <div className="diamond-node">
      <Handle type="target" position={Position.Top} />
      <div className="diamond-shape">
        <span className="diamond-label">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { diamond: DiamondNode }

function rfType(kind: string): string {
  if (kind === 'start') return 'input'
  if (kind === 'end') return 'output'
  if (kind === 'gateway') return 'diamond'
  return 'default'
}

interface NodeData {
  label: string
  kind: string
  role_ref?: string
  outcomes?: string[]
  result?: string
  behavior_ref?: string
  sub_flow_ref?: string
  branches?: any[]
}

function autoLayout(nodes: { id: string }[], edges: { source: string; target: string }[]) {
  const idDepth: Record<string, number> = {}
  for (const n of nodes) idDepth[n.id] = 0
  for (const e of edges) {
    idDepth[e.target] = Math.max(idDepth[e.target] ?? 0, (idDepth[e.source] ?? 0) + 1)
  }
  const groups: Record<number, string[]> = {}
  for (const n of nodes) {
    const d = idDepth[n.id] ?? 0
    ;(groups[d] ||= []).push(n.id)
  }
  const pos: Record<string, { x: number; y: number }> = {}
  for (const d of Object.keys(groups)) {
    groups[Number(d)].forEach((id, i) => {
      pos[id] = { x: 80 + Number(d) * 220, y: 40 + i * 120 }
    })
  }
  return pos
}

export default function FlowDesigner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [defId, setDefId] = useState<number | null>(id ? Number(id) : null)
  const [defName, setDefName] = useState('')
  const [published, setPublished] = useState(false)
  const [nodes, setNodes] = useState<Node<NodeData>[]>([])
  const [edges, setEdges] = useState<Edge<any>[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const counter = useRef(0)

  useEffect(() => {
    metaApi.rules().then(setRules).catch(() => setRules([]))
  }, [])

  useEffect(() => {
    if (!defId) return
    flowApi.getDefinition(defId).then((d) => {
      setDefName(d.name)
      setPublished(d.status === 1)
      const graph = d.node_graph || { nodes: [], edges: [] }
      loadGraph(graph)
    })
  }, [defId])

  const loadGraph = (graph: { nodes: any[]; edges: any[] }) => {
    const pos = autoLayout(graph.nodes, graph.edges)
    const rfNodes: Node<NodeData>[] = graph.nodes.map((n, i) => ({
      id: n.id,
      type: rfType(n.type),
      position: pos[n.id] || { x: 100, y: 100 + i * 80 },
      data: {
        label: n.name,
        kind: n.type,
        role_ref: n.role_ref,
        outcomes: n.outcomes,
        result: n.result,
        behavior_ref: n.behavior_ref,
        sub_flow_ref: n.sub_flow_ref,
        branches: n.branches,
      },
      style: n.type === 'gateway' ? undefined : { border: `1px solid ${KIND_COLOR[n.type] || '#ccc'}`, borderRadius: 8, fontSize: 9, padding: 10 },
    }))
    const rfEdges: Edge<any>[] = graph.edges.map((e, i) => ({
      id: `e${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.approval_outcome || '',
      data: { approval_outcome: e.approval_outcome },
    }))
    setNodes(rfNodes)
    setEdges(rfEdges)
    counter.current = graph.nodes.length
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), [])

  const onConnect = useCallback((conn: Connection) => {
    setEdges((es) => addEdge({ ...conn, data: {} }, es))
    setSelectedEdgeId(null)
  }, [])

  const addNode = (kind: string) => {
    counter.current += 1
    const newId = `${kind}_${counter.current}`
    const newNode: Node<NodeData> = {
      id: newId,
      type: rfType(kind),
      position: { x: 200 + (counter.current % 5) * 60, y: 200 + (counter.current % 4) * 80 },
      data: { label: flowNodeTypeLabel(kind), kind, outcomes: kind === 'approval_task' ? ['APPROVE', 'REJECT'] : undefined, result: kind === 'end' ? 'APPROVED' : undefined, branches: kind === 'gateway' ? [] : undefined },
      style: kind === 'gateway' ? undefined : { border: `1px solid ${KIND_COLOR[kind] || '#ccc'}`, borderRadius: 8, fontSize: 9, padding: 10 },
    }
    setNodes((ns) => [...ns, newNode])
    setSelectedNodeId(newId)
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId])

  const ruleOf = (ruleRef: string) => rules.find((r) => r.id === ruleRef)

  const updateNode = (patch: Partial<NodeData>) => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  const updateEdge = (patch: any) => {
    if (!selectedEdgeId) return
    setEdges((es) => es.map((e) => (e.id === selectedEdgeId ? { ...e, data: { ...e.data, ...patch }, label: patch.approval_outcome ?? '' } : e)))
  }

  const updateBranch = (i: number, patch: any) => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedNodeId) return n
      const branches = [...(n.data.branches || [])]
      branches[i] = { ...branches[i], ...patch }
      return { ...n, data: { ...n.data, branches } }
    }))
  }

  const addBranch = () => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedNodeId) return n
      return { ...n, data: { ...n.data, branches: [...(n.data.branches || []), { name: '', target: '', rule_ref: '', condition: '', is_default: false }] } }
    }))
  }

  const removeBranch = (i: number) => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedNodeId) return n
      return { ...n, data: { ...n.data, branches: (n.data.branches || []).filter((_, idx) => idx !== i) } }
    }))
  }

  const deleteNode = () => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId))
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  const deleteEdge = () => {
    if (!selectedEdgeId) return
    setEdges((es) => es.filter((e) => e.id !== selectedEdgeId))
    setSelectedEdgeId(null)
  }

  const serialize = () => ({
    node_graph: {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.kind,
        name: n.data.label,
        role_ref: n.data.role_ref,
        outcomes: n.data.outcomes,
        result: n.data.result,
        behavior_ref: n.data.behavior_ref,
        sub_flow_ref: n.data.sub_flow_ref,
        branches: n.data.branches,
      })),
      edges: edges.map((e) => ({ source: e.source, target: e.target, approval_outcome: e.data?.approval_outcome })),
    },
  })

  const handleSave = async () => {
    if (!defId) return
    try {
      await flowApi.updateDefinition(defId, serialize())
      toast('保存成功')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handlePublish = async () => {
    if (!defId) return
    try {
      await flowApi.updateDefinition(defId, serialize())
      await flowApi.publishDefinition(defId)
      setPublished(true)
      toast('发布成功')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="page-full" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/flow/definitions')}>
            <ArrowLeft size={14} /> 返回
          </button>
          <span style={{ fontWeight: 700 }}>{defName}</span>
          {published && <span className="badge badge-success">已发布</span>}
        </div>
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={handleSave} disabled={published}>
            <Save size={14} /> 保存草稿
          </button>
          <button className="btn btn-primary" onClick={handlePublish} disabled={published}>
            <Rocket size={14} /> 发布
          </button>
        </div>
      </div>

      <div className="designer-wrap" style={{ flex: 1, minHeight: 0, border: '1px solid var(--divider-color)' }}>
        <div className="designer-palette">
          <div className="palette-title">节点类型</div>
          {KINDS.map((k) => (
            <div key={k} className="palette-item" onClick={() => addNode(k)}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: KIND_COLOR[k], display: 'inline-block' }} />
              {flowNodeTypeLabel(k)}
            </div>
          ))}
        </div>

        <div className="designer-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null) }}
            onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null) }}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="designer-props">
          <h4>属性配置</h4>
          {selectedNode ? (
            <>
              <div className="prop-row">
                <label>节点名称</label>
                <input value={selectedNode.data.label} onChange={(e) => updateNode({ label: e.target.value })} />
              </div>
              <div className="prop-row">
                <label>节点类型</label>
                <div className="text-secondary">{flowNodeTypeLabel(selectedNode.data.kind)}</div>
              </div>
              {(selectedNode.data.kind === 'user_task' || selectedNode.data.kind === 'approval_task') && (
                <div className="prop-row">
                  <label>角色编码 (role_ref)</label>
                  <input value={selectedNode.data.role_ref || ''} onChange={(e) => updateNode({ role_ref: e.target.value })} />
                </div>
              )}
              {selectedNode.data.kind === 'approval_task' && (
                <div className="prop-row">
                  <label>审批结果 (逗号分隔)</label>
                  <input
                    value={(selectedNode.data.outcomes || []).join(',')}
                    onChange={(e) => updateNode({ outcomes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
              )}
              {selectedNode.data.kind === 'end' && (
                <div className="prop-row">
                  <label>结束结果</label>
                  <select value={selectedNode.data.result || 'APPROVED'} onChange={(e) => updateNode({ result: e.target.value })}>
                    <option value="APPROVED">通过</option>
                    <option value="REJECTED">驳回</option>
                  </select>
                </div>
              )}
              {(selectedNode.data.kind === 'system_task' || selectedNode.data.kind === 'behavior_call') && (
                <div className="prop-row">
                  <label>行为引用 (behavior_ref)</label>
                  <input value={selectedNode.data.behavior_ref || ''} onChange={(e) => updateNode({ behavior_ref: e.target.value })} />
                </div>
              )}
              {selectedNode.data.kind === 'sub_flow_call' && (
                <div className="prop-row">
                  <label>子流程引用 (sub_flow_ref)</label>
                  <input value={selectedNode.data.sub_flow_ref || ''} onChange={(e) => updateNode({ sub_flow_ref: e.target.value })} />
                </div>
              )}
              {selectedNode.data.kind === 'gateway' && (
                <div className="prop-row">
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <label style={{ margin: 0 }}>判断分支</label>
                    <button className="btn btn-secondary btn-sm" onClick={addBranch}><Plus size={14} /> 添加分支</button>
                  </div>
                  {(selectedNode.data.branches || []).map((b: any, i: number) => (
                    <div key={i} style={{ border: '1px solid var(--divider-color)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <div className="prop-row">
                        <label>分支名称</label>
                        <input value={b.name || ''} onChange={(e) => updateBranch(i, { name: e.target.value })} />
                      </div>
                      <div className="prop-row">
                        <label>目标节点</label>
                        <select value={b.target || ''} onChange={(e) => updateBranch(i, { target: e.target.value })}>
                          <option value="">请选择</option>
                          {nodes.filter((n) => n.id !== selectedNodeId).map((n) => (
                            <option key={n.id} value={n.id}>{n.data.label}（{n.id}）</option>
                          ))}
                        </select>
                      </div>
                      <div className="prop-row">
                        <label>判断规则 (rule_ref)</label>
                        <select value={b.rule_ref || ''} onChange={(e) => updateBranch(i, { rule_ref: e.target.value || undefined })}>
                          <option value="">无（使用条件表达式）</option>
                          {rules.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}（{r.id}）</option>
                          ))}
                        </select>
                        {b.rule_ref && ruleOf(b.rule_ref) && (
                          <div style={{ marginTop: 4, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, fontSize: 9, color: '#5b6e8c', lineHeight: 1.5 }}>
                            表达式：{ruleOf(b.rule_ref)!.expression}
                          </div>
                        )}
                      </div>
                      <div className="prop-row">
                        <label>条件表达式（rule_ref 为空时生效）</label>
                        <input value={b.condition || ''} placeholder="如 totalAmount >= 1000000" onChange={(e) => updateBranch(i, { condition: e.target.value })} />
                      </div>
                      <div className="prop-row">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" style={{ width: 'auto' }} checked={!!b.is_default} onChange={(e) => updateBranch(i, { is_default: e.target.checked })} />
                          默认分支
                        </label>
                      </div>
                      <button className="btn btn-danger btn-sm" onClick={() => removeBranch(i)}><Trash2 size={14} /> 删除分支</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="prop-row">
                <button className="btn btn-danger btn-sm" onClick={deleteNode}>
                  <Trash2 size={14} /> 删除节点
                </button>
              </div>
            </>
          ) : selectedEdge ? (
            <>
              <div className="prop-row">
                <label>连线 {selectedEdge.source} → {selectedEdge.target}</label>
              </div>
              <div className="prop-row">
                <label>审批结果</label>
                <select
                  value={selectedEdge.data?.approval_outcome || ''}
                  onChange={(e) => updateEdge({ approval_outcome: e.target.value || undefined })}
                >
                  <option value="">无</option>
                  <option value="APPROVE">APPROVE</option>
                  <option value="REJECT">REJECT</option>
                </select>
              </div>
              <div className="prop-row">
                <button className="btn btn-danger btn-sm" onClick={deleteEdge}>
                  <Trash2 size={14} /> 删除连线
                </button>
              </div>
            </>
          ) : (
            <p className="text-secondary">点击节点或连线进行配置。左侧面板可添加节点，拖拽节点间连接生成连线。</p>
          )}
        </div>
      </div>
    </div>
  )
}
