import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Button,
  Checkbox,
  Drawer,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  PlusOutlined,
  RocketOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { flowApi, type FlowGraphBranch } from '../../api/flow'
import { metaApi, type Rule } from '../../api/meta'
import { roleApi } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import { useThemeMode } from '../../theme/ThemeContext'

/* ================= 类型定义 ================= */

interface BranchItem {
  target: string
  rule_ref?: string
  condition?: string
  is_default?: boolean
  [key: string]: unknown
}

interface FlowNodeData extends Record<string, unknown> {
  label: string
  kind: string
  role_ref?: string
  outcomes?: string[]
  result?: string
  behavior_ref?: string
  sub_flow_ref?: string
  branches?: BranchItem[]
}

type FlowNode = import('@xyflow/react').Node<FlowNodeData>
type FlowEdge = import('@xyflow/react').Edge<{ approval_outcome?: string }>

/* ================= 常量 ================= */

const NODE_KINDS = [
  'start',
  'end',
  'approval_task',
  'user_task',
  'gateway',
  'system_task',
  'behavior_call',
  'sub_flow_call',
] as const

export const NODE_TYPE_LABEL: Record<string, string> = {
  start: '开始',
  end: '结束',
  approval_task: '审批任务',
  user_task: '人工任务',
  system_task: '系统任务',
  behavior_call: '行为调用',
  sub_flow_call: '子流程',
  gateway: '网关',
}

const KIND_COLOR: Record<string, string> = {
  start: '#16a34a',
  end: '#ef4444',
  approval_task: '#f59e0b',
  user_task: '#2266e3',
  gateway: '#f43f5e',
  system_task: '#8b5cf6',
  behavior_call: '#0ea5e9',
  sub_flow_call: '#14b8a6',
}

const MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16 }
const PALETTE_DND_KEY = 'application/opic-flow-node'

/* ================= 自定义节点 ================= */

function CardNode({ data, selected }: NodeProps<FlowNode>) {
  const color = KIND_COLOR[data.kind] || '#999'
  return (
    <div
      style={{
        background: '#fff',
        border: `1.5px solid ${selected ? 'var(--og-primary, #1677ff)' : color}`,
        borderRadius: 8,
        padding: '8px 14px',
        minWidth: 120,
        textAlign: 'center',
        boxShadow: selected ? '0 0 0 2px rgba(99,102,241,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 11, color }}>{NODE_TYPE_LABEL[data.kind] || data.kind}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  )
}

function StartNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#16a34a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        border: `2px solid ${selected ? '#1677ff' : '#0f7a37'}`,
        boxShadow: selected ? '0 0 0 3px rgba(22,119,255,0.2)' : undefined,
      }}
    >
      {data.label || '开始'}
      <Handle type="source" position={Position.Bottom} style={{ background: '#16a34a' }} />
    </div>
  )
}

function EndNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#ef4444',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        border: `2px solid ${selected ? '#1677ff' : '#b91c1c'}`,
        boxShadow: selected ? '0 0 0 3px rgba(22,119,255,0.2)' : undefined,
      }}
    >
      {data.label || '结束'}
      <Handle type="target" position={Position.Top} style={{ background: '#ef4444' }} />
    </div>
  )
}

function GatewayNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div style={{ width: 84, height: 84, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 6,
          transform: 'rotate(45deg)',
          background: '#fff',
          border: `2px solid ${selected ? '#1677ff' : '#f43f5e'}`,
          borderRadius: 8,
          boxShadow: selected ? '0 0 0 3px rgba(22,119,255,0.2)' : undefined,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{data.label}</span>
        <span style={{ fontSize: 10, color: '#f43f5e', fontWeight: 400 }}>网关</span>
      </div>
      <Handle type="target" position={Position.Top} style={{ background: '#f43f5e' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#f43f5e' }} />
    </div>
  )
}

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  gateway: GatewayNode,
  approval_task: CardNode,
  user_task: CardNode,
  system_task: CardNode,
  behavior_call: CardNode,
  sub_flow_call: CardNode,
}

/* ================= 自动布局:BFS 深度分列 ================= */

function computeAutoLayout(nodes: FlowNode[], edges: FlowEdge[]): Record<string, { x: number; y: number }> {
  const depth: Record<string, number> = {}
  nodes.forEach((n) => (depth[n.id] = 0))
  const hasIncoming = new Set(edges.map((e) => e.target))
  // 起点:无入边或 start 节点
  let frontier = Array.from(new Set(nodes.filter((n) => !hasIncoming.has(n.id) || n.data.kind === 'start').map((n) => n.id)))
  const visited = new Set(frontier)
  let d = 0
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      depth[id] = d
      for (const e of edges.filter((x) => x.source === id)) {
        if (!visited.has(e.target)) {
          visited.add(e.target)
          next.push(e.target)
        }
      }
    }
    frontier = next
    d += 1
  }
  // 未访问到的节点(环等)放在最后一列
  nodes.forEach((n) => {
    if (!visited.has(n.id)) depth[n.id] = d
  })

  const groups: Record<number, string[]> = {}
  nodes.forEach((n) => {
    const dd = depth[n.id] ?? 0
    ;(groups[dd] ||= []).push(n.id)
  })
  const pos: Record<string, { x: number; y: number }> = {}
  Object.entries(groups).forEach(([dd, ids]) => {
    ids.forEach((id, i) => {
      pos[id] = { x: 60 + Number(dd) * 240, y: 40 + i * 120 }
    })
  })
  return pos
}

/* ================= 设计器 ================= */

function DesignerInner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const hasPerm = usePermission()
  const { mode } = useThemeMode()
  const defId = id ? Number(id) : null
  const { screenToFlowPosition } = useReactFlow()

  const [defName, setDefName] = useState('')
  const [defStatus, setDefStatus] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState<Rule[]>([])
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([])

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    metaApi
      .rules()
      .then(setRules)
      .catch(() => setRules([]))
    roleApi
      .list({ page: 1, size: 50 })
      .then((r) =>
        setRoleOptions((r.list || []).map((x) => ({ value: x.code, label: x.name ? `${x.name}（${x.code}）` : x.code }))),
      )
      .catch(() => setRoleOptions([]))
  }, [])

  useEffect(() => {
    if (!defId) return
    setLoading(true)
    flowApi
      .getDefinition(defId)
      .then((d) => {
        setDefName(d.name)
        setDefStatus(d.status)
        const graph = d.node_graph || { nodes: [], edges: [] }
        const gNodes = graph.nodes || []
        const gEdges = graph.edges || []
        // 有坐标用坐标,否则自动布局
        const allHavePos = gNodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number')
        const autoPos = computeAutoLayout(
          gNodes.map((n, i) => ({ id: n.id, data: { kind: n.type, label: n.name } } as FlowNode)),
          gEdges.map((e, i) => ({ id: `e-${i}`, source: e.source, target: e.target } as FlowEdge)),
        )
        const rfNodes: FlowNode[] = gNodes.map((n, i) => ({
          id: n.id,
          type: n.type,
          position: allHavePos ? { x: n.x!, y: n.y! } : autoPos[n.id] || { x: 100, y: 100 + i * 90 },
          data: {
            label: n.name,
            kind: n.type,
            role_ref: n.role_ref,
            outcomes: n.outcomes,
            result: n.result,
            behavior_ref: n.behavior_ref,
            sub_flow_ref: n.sub_flow_ref,
            branches: (n.branches as BranchItem[]) || [],
          },
        }))
        const rfEdges: FlowEdge[] = gEdges.map((e, i) => ({
          id: `e-${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          markerEnd: MARKER,
          label: e.approval_outcome || undefined,
          data: { approval_outcome: e.approval_outcome },
        }))
        setNodes(rfNodes)
        setEdges(rfEdges)
        counter.current = gNodes.length
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defId])

  const published = defStatus === 1

  /* ---------- 节点增删改 ---------- */

  const addNode = (kind: string, position?: { x: number; y: number }) => {
    counter.current += 1
    const newId = `${kind}_${counter.current}`
    const data: FlowNodeData = {
      label: NODE_TYPE_LABEL[kind] || kind,
      kind,
      outcomes: kind === 'approval_task' ? ['APPROVE', 'REJECT'] : undefined,
      result: kind === 'end' ? 'APPROVED' : undefined,
      branches: kind === 'gateway' ? [] : undefined,
    }
    const newNode: FlowNode = {
      id: newId,
      type: kind,
      position: position || { x: 200 + (counter.current % 5) * 50, y: 160 + (counter.current % 4) * 70 },
      data,
    }
    setNodes((ns) => [...ns, newNode])
    setSelectedNodeId(newId)
    setSelectedEdgeId(null)
  }

  const updateNode = (patch: Partial<FlowNodeData>) => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  const deleteNode = () => {
    if (!selectedNodeId) return
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId))
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  /* ---------- 连线 ---------- */

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      setEdges((eds) =>
        addEdge(
          {
            id: `e-${connection.source}-${connection.target}-${Date.now()}`,
            source: connection.source!,
            target: connection.target!,
            sourceHandle: connection.sourceHandle ?? null,
            targetHandle: connection.targetHandle ?? null,
            type: 'smoothstep',
            markerEnd: MARKER,
            data: {},
          } as FlowEdge,
          eds,
        ),
      )
      setSelectedEdgeId(null)
      setSelectedNodeId(null)
    },
    [setEdges],
  )

  const updateEdge = (approvalOutcome?: string) => {
    if (!selectedEdgeId) return
    setEdges((es) =>
      es.map((e) =>
        e.id === selectedEdgeId
          ? { ...e, data: { approval_outcome: approvalOutcome }, label: approvalOutcome || undefined }
          : e,
      ),
    )
  }

  const deleteEdge = () => {
    if (!selectedEdgeId) return
    setEdges((es) => es.filter((e) => e.id !== selectedEdgeId))
    setSelectedEdgeId(null)
  }

  /* ---------- 网关分支编辑 ---------- */

  const updateBranch = (i: number, patch: Partial<BranchItem>) => {
    if (!selectedNodeId) return
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedNodeId) return n
        const branches = [...(n.data.branches || [])]
        branches[i] = { ...branches[i], ...patch }
        return { ...n, data: { ...n.data, branches } }
      }),
    )
  }

  const addBranch = () => {
    if (!selectedNodeId) return
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedNodeId) return n
        const b: FlowGraphBranch = { target: '', rule_ref: '', condition: '', is_default: false }
        return { ...n, data: { ...n.data, branches: [...(n.data.branches || []), b] } }
      }),
    )
  }

  const removeBranch = (i: number) => {
    if (!selectedNodeId) return
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedNodeId) return n
        return { ...n, data: { ...n.data, branches: (n.data.branches || []).filter((_, idx) => idx !== i) } }
      }),
    )
  }

  /* ---------- 拖拽 ---------- */

  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData(PALETTE_DND_KEY, kind)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData(PALETTE_DND_KEY)
    if (!kind) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(kind, position)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /* ---------- 选中对象 ---------- */

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId])
  const drawerOpen = !!selectedNode || !!selectedEdge

  // 连线可选审批结果:聚合所有审批节点 outcomes,缺省 APPROVE/REJECT
  const outcomeOptions = useMemo(() => {
    const set = new Set<string>()
    nodes.forEach((n) => (n.data.outcomes || []).forEach((o) => set.add(o)))
    if (set.size === 0) {
      set.add('APPROVE')
      set.add('REJECT')
    }
    return Array.from(set).map((o) => ({ value: o, label: o }))
  }, [nodes])

  /* ---------- 序列化与保存 ---------- */

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
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        approval_outcome: e.data?.approval_outcome,
      })),
    },
  })

  const handleAutoLayout = () => {
    const pos = computeAutoLayout(nodes, edges)
    setNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)))
  }

  const handleSave = async () => {
    if (!defId) return
    setSaving(true)
    try {
      await flowApi.updateDefinition(defId, serialize())
      message.success('保存成功')
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!defId) return
    setSaving(true)
    try {
      await flowApi.updateDefinition(defId, serialize())
      await flowApi.publishDefinition(defId)
      setDefStatus(1)
      message.success('发布成功')
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  const canEdit = hasPerm('flow:definition:edit') && !published

  const selectedRule = (ruleRef?: string) => rules.find((r) => r.id === ruleRef)

  return (
    <div
      className="flow-designer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 170px)',
        minHeight: 480,
      }}
    >
      {/* 顶部工具栏 */}
      <div className="flow-designer-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/flow/definitions')}>
            返回
          </Button>
          <Typography.Text strong>{defName || `流程 #${defId}`}</Typography.Text>
          {published ? <Tag color="green">已发布</Tag> : <Tag color="gold">草稿</Tag>}
        </Space>
        <Space>
          <Button icon={<ApartmentOutlined />} onClick={handleAutoLayout}>
            自动布局
          </Button>
          {canEdit && (
            <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          )}
          {!published && hasPerm('flow:definition:publish') && (
            <Button type="primary" icon={<RocketOutlined />} loading={saving} onClick={handlePublish}>
              发布
            </Button>
          )}
        </Space>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧节点面板 */}
        <div
          className="flow-designer-palette"
          style={{
            width: 150,
            padding: 10,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>节点类型</div>
          {NODE_KINDS.map((k) => (
            <div
              key={k}
              draggable
              onDragStart={(e) => onDragStart(e, k)}
              onClick={() => addNode(k)}
              className="flow-designer-palette-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                marginBottom: 6,
                borderRadius: 6,
                cursor: 'grab',
                fontSize: 12,
              }}
              title="点击或拖拽添加节点"
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: k === 'start' || k === 'end' ? '50%' : 2,
                  background: KIND_COLOR[k],
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {NODE_TYPE_LABEL[k]}
            </div>
          ))}
        </div>

        {/* 画布 */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
              <Spin size="large" />
            </div>
          ) : (
            <ReactFlow
              colorMode={mode}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => {
                setSelectedNodeId(n.id)
                setSelectedEdgeId(null)
              }}
              onEdgeClick={(_, e) => {
                setSelectedEdgeId(e.id)
                setSelectedNodeId(null)
              }}
              onPaneClick={() => {
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
              }}
              defaultEdgeOptions={{ type: 'smoothstep', markerEnd: MARKER }}
              fitView
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background gap={16} />
              <Controls />
              <MiniMap pannable zoomable style={{ width: 140, height: 90 }} />
            </ReactFlow>
          )}
        </div>
      </div>

      {/* 右侧属性抽屉 */}
      <Drawer
        title={selectedNode ? '节点属性' : '连线属性'}
        open={drawerOpen}
        onClose={() => {
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
        }}
        width={400}
        destroyOnHidden
      >
        {selectedNode ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Typography.Text type="secondary">节点类型</Typography.Text>
              <div>
                <Tag color={KIND_COLOR[selectedNode.data.kind]}>
                  {NODE_TYPE_LABEL[selectedNode.data.kind] || selectedNode.data.kind}
                </Tag>
                <Typography.Text type="secondary" copyable={{ text: selectedNode.id }} style={{ fontSize: 12 }}>
                  {selectedNode.id}
                </Typography.Text>
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">节点名称</Typography.Text>
              <Input
                value={selectedNode.data.label}
                onChange={(e) => updateNode({ label: e.target.value })}
                placeholder="节点名称"
              />
            </div>

            {(selectedNode.data.kind === 'approval_task' || selectedNode.data.kind === 'user_task') && (
              <div>
                <Typography.Text type="secondary">角色 (role_ref)</Typography.Text>
                <Select
                  showSearch
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="选择角色"
                  value={selectedNode.data.role_ref || undefined}
                  onChange={(v) => updateNode({ role_ref: v })}
                  options={roleOptions}
                  optionFilterProp="label"
                />
              </div>
            )}

            {selectedNode.data.kind === 'approval_task' && (
              <div>
                <Typography.Text type="secondary">审批结果 outcomes(逗号分隔)</Typography.Text>
                <Input
                  value={(selectedNode.data.outcomes || []).join(',')}
                  onChange={(e) =>
                    updateNode({ outcomes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                  }
                  placeholder="如 APPROVE,REJECT"
                />
              </div>
            )}

            {selectedNode.data.kind === 'end' && (
              <div>
                <Typography.Text type="secondary">结束结果 result</Typography.Text>
                <Select
                  style={{ width: '100%' }}
                  value={selectedNode.data.result || 'APPROVED'}
                  onChange={(v) => updateNode({ result: v })}
                  options={[
                    { value: 'APPROVED', label: '通过 (APPROVED)' },
                    { value: 'REJECTED', label: '驳回 (REJECTED)' },
                  ]}
                />
              </div>
            )}

            {(selectedNode.data.kind === 'system_task' || selectedNode.data.kind === 'behavior_call') && (
              <div>
                <Typography.Text type="secondary">行为引用 (behavior_ref)</Typography.Text>
                <Input
                  value={selectedNode.data.behavior_ref || ''}
                  onChange={(e) => updateNode({ behavior_ref: e.target.value })}
                  placeholder="behavior_ref"
                />
              </div>
            )}

            {selectedNode.data.kind === 'sub_flow_call' && (
              <div>
                <Typography.Text type="secondary">子流程引用 (sub_flow_ref)</Typography.Text>
                <Input
                  value={selectedNode.data.sub_flow_ref || ''}
                  onChange={(e) => updateNode({ sub_flow_ref: e.target.value })}
                  placeholder="sub_flow_ref"
                />
              </div>
            )}

            {selectedNode.data.kind === 'gateway' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Typography.Text type="secondary">判断分支</Typography.Text>
                  <Button size="small" icon={<PlusOutlined />} onClick={addBranch}>
                    添加分支
                  </Button>
                </div>
                {(selectedNode.data.branches || []).map((b, i) => (
                  <div
                    key={i}
                    style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 10, marginBottom: 8 }}
                  >
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      分支 {i + 1}
                    </Typography.Text>
                    <div style={{ marginTop: 6 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        目标节点
                      </Typography.Text>
                      <Select
                        showSearch
                        style={{ width: '100%' }}
                        placeholder="选择目标节点"
                        value={(b.target as string) || undefined}
                        onChange={(v) => updateBranch(i, { target: v })}
                        optionFilterProp="label"
                        options={nodes
                          .filter((n) => n.id !== selectedNode.id)
                          .map((n) => ({ value: n.id, label: `${n.data.label}（${n.id}）` }))}
                      />
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        判断规则 (rule_ref)
                      </Typography.Text>
                      <Select
                        showSearch
                        allowClear
                        style={{ width: '100%' }}
                        placeholder="无(使用条件表达式)"
                        value={(b.rule_ref as string) || undefined}
                        onChange={(v) => updateBranch(i, { rule_ref: v })}
                        optionFilterProp="label"
                        options={rules.map((r) => ({ value: r.id, label: `${r.name}（${r.id}）` }))}
                      />
                      {b.rule_ref && selectedRule(b.rule_ref as string) && (
                        <div
                          style={{
                            marginTop: 4,
                            padding: '4px 8px',
                            background: '#f8fafc',
                            borderRadius: 4,
                            fontSize: 12,
                            color: '#5b6e8c',
                          }}
                        >
                          表达式:{selectedRule(b.rule_ref as string)!.expression}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        条件表达式(rule_ref 为空时生效)
                      </Typography.Text>
                      <Input
                        value={(b.condition as string) || ''}
                        placeholder="如 totalAmount >= 1000000"
                        onChange={(e) => updateBranch(i, { condition: e.target.value })}
                      />
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <Checkbox
                        checked={!!b.is_default}
                        onChange={(e) => updateBranch(i, { is_default: e.target.checked })}
                      >
                        默认分支
                      </Checkbox>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeBranch(i)}>
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <Button danger block icon={<DeleteOutlined />} onClick={deleteNode}>
                删除节点
              </Button>
            )}
          </Space>
        ) : selectedEdge ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Typography.Text type="secondary">连线</Typography.Text>
              <div>
                {selectedEdge.source} → {selectedEdge.target}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">审批结果 approval_outcome(允许为空)</Typography.Text>
              <Select
                allowClear
                style={{ width: '100%' }}
                placeholder="无"
                value={selectedEdge.data?.approval_outcome || undefined}
                onChange={(v) => updateEdge(v)}
                options={outcomeOptions}
              />
            </div>
            {canEdit && (
              <Button danger block icon={<DeleteOutlined />} onClick={deleteEdge}>
                删除连线
              </Button>
            )}
          </Space>
        ) : null}
      </Drawer>
    </div>
  )
}

export default function FlowDesigner() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  )
}
