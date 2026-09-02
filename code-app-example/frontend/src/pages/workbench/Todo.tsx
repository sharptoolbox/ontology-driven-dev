import { useEffect, useState } from 'react'
import { Check, Inbox, X } from 'lucide-react'
import { workbenchApi, type TodoItem } from '../../api/workbench'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const BIZ_LABEL: Record<string, string> = { CONTRACT: '合同', INVOICE: '开票' }

export default function Todo() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<TodoItem[]>([])
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState<TodoItem | null>(null)
  const [comment, setComment] = useState('')

  const load = async () => {
    const res = await workbenchApi.todo({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  const open = (t: TodoItem) => { setCurrent(t); setComment('') }

  const doAction = async (action: 'approve' | 'reject' | 'return') => {
    if (!current) return
    try {
      if (action === 'approve') await workbenchApi.approve(current.id, comment)
      else if (action === 'reject') await workbenchApi.reject(current.id, comment)
      else await workbenchApi.returnTask(current.id, comment)
      toast(action === 'approve' ? '审批通过' : action === 'reject' ? '已驳回' : '已退回')
      setCurrent(null)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>我的待办</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>业务类型</th><th>业务编号</th><th>业务名称</th><th>审批节点</th><th>提交时间</th><th>操作</th></tr></thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>{BIZ_LABEL[t.biz_type] || t.biz_type}</td>
                <td>{t.biz_no}</td>
                <td>{t.biz_name || '-'}</td>
                <td>{t.activity_name}</td>
                <td>{t.started_at}</td>
                <td><button className="btn btn-primary btn-sm" onClick={() => open(t)}><Inbox size={14} /> 处理</button></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无待办</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>

      <Modal
        title="审批处理"
        open={!!current}
        onClose={() => setCurrent(null)}
        footer={
          <>
            <button className="btn btn-danger" onClick={() => doAction('reject')}><X size={14} /> 驳回</button>
            <button className="btn btn-secondary" onClick={() => doAction('return')}>退回</button>
            <button className="btn btn-primary" onClick={() => doAction('approve')}><Check size={14} /> 通过</button>
          </>
        }
      >
        <p className="text-secondary" style={{ marginBottom: 12 }}>
          {BIZ_LABEL[current?.biz_type || '']}：{current?.biz_name}（{current?.biz_no}） · 节点：{current?.activity_name}
        </p>
        <div className="prop-row">
          <label>审批意见</label>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
