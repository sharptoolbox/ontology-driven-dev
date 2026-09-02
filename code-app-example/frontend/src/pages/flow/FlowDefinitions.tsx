import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Plus, Rocket } from 'lucide-react'
import { flowApi, type FlowDefinition } from '../../api/flow'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const typeLabel: Record<string, string> = { APPROVAL: '审批流', COLLABORATION: '协同流' }

function defStatus(status: number) {
  if (status === 1) return { label: '已发布', className: 'badge-success' }
  if (status === 2) return { label: '已停用', className: 'badge-neutral' }
  return { label: '草稿', className: 'badge-warning' }
}

export default function FlowDefinitions() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<FlowDefinition[]>([])
  const [total, setTotal] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', flow_type: 'APPROVAL', description: '' })

  const load = async () => {
    const res = await flowApi.listDefinitions({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleCreate = async () => {
    try {
      const r: any = await flowApi.createDefinition(form)
      toast('创建成功')
      setShowCreate(false)
      navigate(`/flow/designer/${r.id}`)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handlePublish = async (d: FlowDefinition) => {
    try {
      await flowApi.publishDefinition(d.id)
      toast('发布成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="flex-between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>流程定义</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> 新建流程
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>流程编码</th>
              <th>流程名称</th>
              <th>流程类型</th>
              <th>触发方式</th>
              <th>版本</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const s = defStatus(d.status)
              return (
                <tr key={d.id}>
                  <td>{d.code}</td>
                  <td>{d.name}</td>
                  <td>{typeLabel[d.flow_type] || d.flow_type}</td>
                  <td>{d.trigger_type}</td>
                  <td>v{d.version}</td>
                  <td><span className={`badge ${s.className}`}>{s.label}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/flow/designer/${d.id}`)}>
                      <GitBranch size={14} /> 设计
                    </button>
                    {d.status !== 1 && (
                      <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={() => handlePublish(d)}>
                        <Rocket size={14} /> 发布
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>

      <Modal
        title="新建流程定义"
        open={showCreate}
        onClose={() => setShowCreate(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleCreate}>创建并设计</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-item span-2">
            <label className="field-label required">流程编码</label>
            <div className="field-control">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label required">流程名称</label>
            <div className="field-control">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">流程类型</label>
            <div className="field-control">
              <select value={form.flow_type} onChange={(e) => setForm({ ...form, flow_type: e.target.value })}>
                <option value="APPROVAL">审批流</option>
                <option value="COLLABORATION">协同流</option>
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">描述</label>
            <div className="field-control">
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
