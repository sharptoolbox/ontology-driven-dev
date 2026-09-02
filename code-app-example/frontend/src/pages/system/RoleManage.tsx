import { useEffect, useState } from 'react'
import { Edit2, KeyRound, Plus, Trash2 } from 'lucide-react'
import { roleApi, type SysRole } from '../../api/role'
import { permissionApi, type Permission } from '../../api/permission'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const emptyForm = { name: '', code: '', parent_id: 0, description: '', status: 1 }

export default function RoleManage() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<SysRole[]>([])
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<SysRole | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [allRoles, setAllRoles] = useState<SysRole[]>([])
  const [allPerms, setAllPerms] = useState<Permission[]>([])
  const [assignRole, setAssignRole] = useState<SysRole | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<Set<number>>(new Set())

  const load = async () => {
    const res = await roleApi.list({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    roleApi.list({ page: 1, size: 100 }).then((r) => setAllRoles(r.list))
    permissionApi.all().then(setAllPerms)
  }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (r: SysRole) => {
    setEditing(r)
    setForm({ name: r.name, code: r.code, parent_id: r.parent_id, description: r.description || '', status: r.status })
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      if (editing) await roleApi.update(editing.id, form)
      else await roleApi.create(form)
      toast('保存成功')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (r: SysRole) => {
    if (!window.confirm(`确认删除角色「${r.name}」？`)) return
    try {
      await roleApi.remove(r.id)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const openAssign = (r: SysRole) => {
    setAssignRole(r)
    setSelectedPerms(new Set(r.permissions))
  }

  const togglePerm = (id: number) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAssign = async () => {
    if (!assignRole) return
    try {
      await roleApi.assignPermissions(assignRole.id, Array.from(selectedPerms))
      toast('分配成功')
      setAssignRole(null)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex-between">
          <h3 style={{ fontWeight: 700 }}>角色列表</h3>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> 新增</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>角色名称</th>
                <th>编码</th>
                <th>父角色</th>
                <th>描述</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const parent = allRoles.find((x) => x.id === r.parent_id)
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.code}</td>
                    <td>{parent?.name || '-'}</td>
                    <td>{r.description || '-'}</td>
                    <td><span className={`badge ${r.status === 1 ? 'badge-success' : 'badge-neutral'}`}>{r.status === 1 ? '启用' : '禁用'}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => openAssign(r)}><KeyRound size={14} /></button>
                      {r.code !== 'admin' && (
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(r)}><Trash2 size={14} /></button>
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
      </div>

      <Modal
        title={editing ? '编辑角色' : '新增角色'}
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
            <label className="field-label required">角色名称</label>
            <div className="field-control"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label required">编码</label>
            <div className="field-control"><input value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">父角色</label>
            <div className="field-control">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: Number(e.target.value) })}>
                <option value={0}>无</option>
                {allRoles.filter((r) => r.id !== editing?.id).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
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
          <div className="form-item span-2">
            <label className="field-label">描述</label>
            <div className="field-control"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
        </div>
      </Modal>

      <Modal
        title={`分配权限 - ${assignRole?.name || ''}`}
        open={!!assignRole}
        onClose={() => setAssignRole(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAssignRole(null)}>取消</button>
            <button className="btn btn-primary" onClick={handleAssign}>保存</button>
          </>
        }
      >
        <div className="table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>选择</th><th>权限编码</th><th>名称</th></tr></thead>
            <tbody>
              {allPerms.map((p) => (
                <tr key={p.id}>
                  <td><input type="checkbox" style={{ width: 'auto' }} checked={selectedPerms.has(p.id)} onChange={() => togglePerm(p.id)} /></td>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
