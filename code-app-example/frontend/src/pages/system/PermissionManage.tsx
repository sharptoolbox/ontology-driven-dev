import { useEffect, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { permissionApi, type Permission } from '../../api/permission'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const emptyForm = {
  code: '', name: '', target_type: 'BEHAVIOR', target_ref: '', data_scope: 'ALL', abac_condition: '', status: 1,
}

export default function PermissionManage() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [data, setData] = useState<Permission[]>([])
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<Permission | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })

  const load = async () => {
    const res = await permissionApi.list({ page, size, keyword })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (p: Permission) => {
    setEditing(p)
    setForm({
      code: p.code, name: p.name, target_type: p.target_type, target_ref: p.target_ref,
      data_scope: p.data_scope, abac_condition: p.abac_condition || '', status: p.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      if (editing) await permissionApi.update(editing.id, form)
      else await permissionApi.create(form)
      toast('保存成功')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (p: Permission) => {
    if (!window.confirm(`确认删除权限「${p.code}」？`)) return
    try {
      await permissionApi.remove(p.id)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex-between">
          <div className="form-item" style={{ width: 320 }}>
            <label className="field-label">关键词</label>
            <div className="field-control">
              <input placeholder="权限编码 / 名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
          </div>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => { setPage(1); load() }}>查询</button>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> 新增</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>权限编码</th>
                <th>名称</th>
                <th>目标类型</th>
                <th>目标引用</th>
                <th>数据范围</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td>{p.target_type}</td>
                  <td>{p.target_ref}</td>
                  <td>{p.data_scope}</td>
                  <td><span className={`badge ${p.status === 1 ? 'badge-success' : 'badge-neutral'}`}>{p.status === 1 ? '启用' : '禁用'}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}><Edit2 size={14} /></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(p)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </div>

      <Modal
        title={editing ? '编辑权限' : '新增权限'}
        open={showForm}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}>保存</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-item">
            <label className="field-label required">权限编码</label>
            <div className="field-control"><input value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label required">名称</label>
            <div className="field-control"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">目标类型</label>
            <div className="field-control">
              <select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })}>
                <option value="BEHAVIOR">行为</option>
                <option value="ENTITY">实体</option>
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">目标引用</label>
            <div className="field-control"><input value={form.target_ref} onChange={(e) => setForm({ ...form, target_ref: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">数据范围</label>
            <div className="field-control">
              <select value={form.data_scope} onChange={(e) => setForm({ ...form, data_scope: e.target.value })}>
                <option value="ALL">全部</option>
                <option value="OWN">本人</option>
                <option value="DEPT">本部门</option>
                <option value="CUSTOM">自定义</option>
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">状态</label>
            <div className="field-control">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}>
                <option value={1}>启用</option>
                <option value={0}>禁用</option>
              </select>
            </div>
          </div>
          {form.data_scope === 'CUSTOM' && (
            <div className="form-item span-2">
              <label className="field-label required">ABAC 条件</label>
              <div className="field-control"><input value={form.abac_condition} onChange={(e) => setForm({ ...form, abac_condition: e.target.value })} /></div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
