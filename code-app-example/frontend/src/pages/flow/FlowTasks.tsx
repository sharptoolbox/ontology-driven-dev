import { useEffect, useState } from 'react'
import { ArrowLeftRight, BellRing } from 'lucide-react'
import { flowApi, type FlowTask } from '../../api/flow'
import { userApi } from '../../api/user'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

export default function FlowTasks() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<FlowTask[]>([])
  const [total, setTotal] = useState(0)
  const [transferTarget, setTransferTarget] = useState<FlowTask | null>(null)
  const [users, setUsers] = useState<{ id: number; name: string; code: string }[]>([])
  const [assigneeId, setAssigneeId] = useState<number | null>(null)

  const load = async () => {
    const res = await flowApi.listTasks({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    userApi.roleOptions().then((opts) => setUsers(opts))
  }, [])

  const openTransfer = (t: FlowTask) => {
    setTransferTarget(t)
    setAssigneeId(null)
  }

  const handleTransfer = async () => {
    if (!transferTarget || !assigneeId) {
      toast('请选择目标用户', 'error')
      return
    }
    try {
      await flowApi.transferTask(transferTarget.id, assigneeId)
      toast('转办成功')
      setTransferTarget(null)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleUrge = async (t: FlowTask) => {
    try {
      await flowApi.urgeTask(t.id)
      toast('催办成功')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>任务管理</h3>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>业务单号</th>
              <th>任务节点</th>
              <th>办理人</th>
              <th>状态</th>
              <th>动作</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>{t.business_key || '-'}</td>
                <td>{t.activity_name}</td>
                <td>{t.assignee_name || '-'}</td>
                <td>{t.status}</td>
                <td>{t.action || '-'}</td>
                <td>{t.created_at}</td>
                <td>
                  {t.status === 'TODO' && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => openTransfer(t)}>
                        <ArrowLeftRight size={14} /> 转办
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => handleUrge(t)}>
                        <BellRing size={14} /> 催办
                      </button>
                    </>
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

      <Modal
        title="任务转办"
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTransferTarget(null)}>取消</button>
            <button className="btn btn-primary" onClick={handleTransfer}>确认转办</button>
          </>
        }
      >
        <p className="text-secondary" style={{ marginBottom: 12 }}>
          任务：{transferTarget?.activity_name}（当前办理人：{transferTarget?.assignee_name}）
        </p>
        <div className="prop-row">
          <label>目标用户</label>
          <select value={assigneeId ?? ''} onChange={(e) => setAssigneeId(Number(e.target.value))}>
            <option value="">请选择</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}（{u.code}）</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  )
}
