import { useEffect, useState } from 'react'
import { Edit2, KeyRound, Plus, Shield, Trash2 } from 'lucide-react'
import { userApi, type SysUser } from '../../api/user'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'
import { usePermission } from '../../stores/userStore'

const emptyForm = {
  username: '', password: '', real_name: '', email: '', phone: '',
  actor_type: 'HUMAN', status: 1, role_ids: [] as number[],
}

export default function UserManage() {
  const hasPerm = usePermission()
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [data, setData] = useState<SysUser[]>([])
  const [total, setTotal] = useState(0)
  const [roleOptions, setRoleOptions] = useState<{ id: number; name: string; code: string }[]>([])
  const [editing, setEditing] = useState<SysUser | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })

  const load = async () => {
    const res = await userApi.list({ page, size, keyword })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    userApi.roleOptions().then(setRoleOptions)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (u: SysUser) => {
    setEditing(u)
    setForm({
      username: u.username, password: '', real_name: u.real_name || '', email: u.email || '',
      phone: u.phone || '', actor_type: u.actor_type, status: u.status,
      role_ids: u.roles.map((r) => r.id),
    })
    setShowForm(true)
  }

  const toggleRole = (id: number) => {
    setForm((f) => ({
      ...f,
      role_ids: f.role_ids.includes(id) ? f.role_ids.filter((r) => r !== id) : [...f.role_ids, id],
    }))
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await userApi.update(editing.id, form)
      } else {
        await userApi.create(form)
      }
      toast('保存成功')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (u: SysUser) => {
    if (!window.confirm(`确认删除用户「${u.username}」？`)) return
    try {
      await userApi.remove(u.id)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleResetPwd = async (u: SysUser) => {
    const pwd = window.prompt(`重置用户「${u.username}」的密码：`, '123456')
    if (!pwd) return
    try {
      await userApi.resetPwd(u.id, pwd)
      toast('重置成功')
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
              <input placeholder="用户名 / 手机号 / 姓名" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
          </div>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => { setPage(1); load() }}>查询</button>
            {hasPerm('system:user:add') && (
              <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> 新增</button>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>姓名</th>
                <th>手机号</th>
                <th>角色</th>
                <th>类型</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.real_name || '-'}</td>
                  <td>{u.phone || '-'}</td>
                  <td>{u.roles.map((r) => r.name).join('、') || '-'}</td>
                  <td>{u.actor_type}</td>
                  <td>
                    <span className={`badge ${u.status === 1 ? 'badge-success' : 'badge-neutral'}`}>
                      {u.status === 1 ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td>
                    {hasPerm('system:user:edit') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}><Edit2 size={14} /></button>
                    )}
                    {hasPerm('system:user:assign-role') && (
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => openEdit(u)}><Shield size={14} /></button>
                    )}
                    {hasPerm('system:user:reset-pwd') && (
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleResetPwd(u)}><KeyRound size={14} /></button>
                    )}
                    {hasPerm('system:user:delete') && u.username !== 'admin' && (
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(u)}><Trash2 size={14} /></button>
                    )}
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
        title={editing ? '编辑用户' : '新增用户'}
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
            <label className="field-label required">用户名</label>
            <div className="field-control">
              <input value={form.username} disabled={!!editing} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">{editing ? '密码(留空不改)' : '初始密码'}</label>
            <div className="field-control">
              <input type="password" value={form.password} placeholder={editing ? '留空则不修改' : '默认 123456'} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">姓名</label>
            <div className="field-control">
              <input value={form.real_name} onChange={(e) => setForm({ ...form, real_name: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">手机号</label>
            <div className="field-control">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">邮箱</label>
            <div className="field-control">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">类型</label>
            <div className="field-control">
              <select value={form.actor_type} onChange={(e) => setForm({ ...form, actor_type: e.target.value })}>
                <option value="HUMAN">人工账户</option>
                <option value="SYSTEM">系统账户</option>
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
        </div>
        <div className="prop-row" style={{ marginTop: 16 }}>
          <label>分配角色</label>
          <div className="toolbar" style={{ gap: 16 }}>
            {roleOptions.map((r) => (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} style={{ width: 'auto' }} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
