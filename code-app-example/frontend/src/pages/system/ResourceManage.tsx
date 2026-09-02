import { useEffect, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { resourceApi, type SysResource } from '../../api/resource'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const typeLabel: Record<string, string> = { DIRECTORY: '目录', MENU: '菜单', BUTTON: '按钮', API: '接口' }

const emptyForm = {
  parent_id: 0, name: '', code: '', permission_code: '', type: 'MENU', path: '', icon: '', sort_order: 0, http_method: 'GET', status: 1,
}

export default function ResourceManage() {
  const [tree, setTree] = useState<SysResource[]>([])
  const [flat, setFlat] = useState<{ row: SysResource; level: number }[]>([])
  const [editing, setEditing] = useState<SysResource | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })

  const load = async () => {
    const t = await resourceApi.tree()
    setTree(t)
    const f: { row: SysResource; level: number }[] = []
    const walk = (nodes: SysResource[], level: number) => {
      nodes.forEach((n) => {
        f.push({ row: n, level })
        if (n.children) walk(n.children, level + 1)
      })
    }
    walk(t, 0)
    setFlat(f)
  }

  useEffect(() => {
    load()
  }, [])

  const openAdd = (parent?: SysResource) => {
    setEditing(null)
    setForm({ ...emptyForm, parent_id: parent?.id || 0, type: parent ? 'MENU' : 'DIRECTORY' })
    setShowForm(true)
  }

  const openEdit = (r: SysResource) => {
    setEditing(r)
    setForm({
      parent_id: r.parent_id, name: r.name, code: r.code, permission_code: r.permission_code || '',
      type: r.type, path: r.path || '', icon: r.icon || '', sort_order: r.sort_order,
      http_method: r.http_method || 'GET', status: r.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      if (editing) await resourceApi.update(editing.id, form)
      else await resourceApi.create(form)
      toast('保存成功')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (r: SysResource) => {
    if (!window.confirm(`确认删除资源「${r.name}」及其子资源？`)) return
    try {
      await resourceApi.remove(r.id)
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
          <h3 style={{ fontWeight: 700 }}>资源管理（菜单 / 按钮 / 接口）</h3>
          <button className="btn btn-primary" onClick={() => openAdd()}><Plus size={14} /> 新增根资源</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>编码</th>
                <th>路径</th>
                <th>权限标识</th>
                <th>排序</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {flat.map(({ row, level }) => (
                <tr key={row.id}>
                  <td style={{ paddingLeft: 12 + level * 20 }}>{row.name}</td>
                  <td>{typeLabel[row.type] || row.type}</td>
                  <td>{row.code}</td>
                  <td>{row.path || '-'}</td>
                  <td>{row.permission_code || '-'}</td>
                  <td>{row.sort_order}</td>
                  <td><span className={`badge ${row.status === 1 ? 'badge-success' : 'badge-neutral'}`}>{row.status === 1 ? '启用' : '禁用'}</span></td>
                  <td>
                    {row.type === 'DIRECTORY' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openAdd(row)}><Plus size={14} /></button>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => openEdit(row)}><Edit2 size={14} /></button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(row)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        title={editing ? '编辑资源' : '新增资源'}
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
            <label className="field-label">父资源</label>
            <div className="field-control">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: Number(e.target.value) })}>
                <option value={0}>无（根）</option>
                {tree.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">类型</label>
            <div className="field-control">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="DIRECTORY">目录</option>
                <option value="MENU">菜单</option>
                <option value="BUTTON">按钮</option>
                <option value="API">接口</option>
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">名称</label>
            <div className="field-control"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label required">编码</label>
            <div className="field-control"><input value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          {form.type === 'MENU' && (
            <div className="form-item">
              <label className="field-label required">路径</label>
              <div className="field-control"><input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} /></div>
            </div>
          )}
          {(form.type === 'BUTTON' || form.type === 'API') && (
            <div className="form-item">
              <label className="field-label required">权限标识</label>
              <div className="field-control"><input value={form.permission_code} onChange={(e) => setForm({ ...form, permission_code: e.target.value })} /></div>
            </div>
          )}
          {form.type === 'MENU' && (
            <div className="form-item">
              <label className="field-label">权限标识</label>
              <div className="field-control"><input value={form.permission_code} onChange={(e) => setForm({ ...form, permission_code: e.target.value })} /></div>
            </div>
          )}
          <div className="form-item">
            <label className="field-label">图标</label>
            <div className="field-control"><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">排序</label>
            <div className="field-control"><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
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
        </div>
      </Modal>
    </div>
  )
}
