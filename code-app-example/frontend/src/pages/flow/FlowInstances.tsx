import { useEffect, useState } from 'react'
import { Eye, Ban } from 'lucide-react'
import { flowApi, type FlowInstance } from '../../api/flow'
import Pagination from '../../components/Pagination'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'
import { statusBadge } from '../../utils/status'

export default function FlowInstances() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<FlowInstance[]>([])
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<any>(null)

  const load = async () => {
    const res = await flowApi.listInstances({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const openDetail = async (id: number) => {
    const d = await flowApi.getInstance(id)
    setDetail(d)
  }

  const handleTerminate = async (id: number) => {
    if (!window.confirm('确认强制终止该流程实例？')) return
    try {
      await flowApi.terminateInstance(id)
      toast('已终止')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>流程实例</h3>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>流程</th>
              <th>业务单号</th>
              <th>发起人</th>
              <th>状态</th>
              <th>发起时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i) => {
              const s = statusBadge(i.status)
              return (
                <tr key={i.id}>
                  <td>{i.def_name}</td>
                  <td>{i.business_key}</td>
                  <td>{i.creator_id}</td>
                  <td><span className={`badge ${s.className}`}>{s.label}</span></td>
                  <td>{i.started_at}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(i.id)}>
                      <Eye size={14} /> 详情
                    </button>
                    {i.status === 'RUNNING' && (
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => handleTerminate(i.id)}>
                        <Ban size={14} /> 终止
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

      <Modal title="流程实例详情" open={!!detail} onClose={() => setDetail(null)} width={720}>
        {detail && (
          <>
            <div className="form-grid-2">
              <div className="form-item"><label className="field-label">流程</label><div className="field-control"><span>{detail.definition?.name}</span></div></div>
              <div className="form-item"><label className="field-label">业务单号</label><div className="field-control"><span>{detail.business_key}</span></div></div>
              <div className="form-item"><label className="field-label">状态</label><div className="field-control"><BadgeText s={detail.status} /></div></div>
              <div className="form-item"><label className="field-label">发起时间</label><div className="field-control"><span>{detail.started_at}</span></div></div>
            </div>
            <h4 style={{ margin: '16px 0 8px' }}>任务</h4>
            <div className="table-container">
              <table>
                <thead><tr><th>节点</th><th>办理人</th><th>状态</th><th>动作</th></tr></thead>
                <tbody>
                  {detail.tasks.map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.activity_name}</td>
                      <td>{t.assignee_name || '-'}</td>
                      <td>{t.status}</td>
                      <td>{t.action || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4 style={{ margin: '16px 0 8px' }}>审批历史</h4>
            <div className="table-container">
              <table>
                <thead><tr><th>节点</th><th>操作人</th><th>动作</th><th>意见</th><th>时间</th></tr></thead>
                <tbody>
                  {detail.history.map((h: any) => (
                    <tr key={h.id}>
                      <td>{h.activity_name || '-'}</td>
                      <td>{h.operator_name || '-'}</td>
                      <td>{h.action}</td>
                      <td>{h.comment || '-'}</td>
                      <td>{h.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function BadgeText({ s }: { s: string }) {
  const b = statusBadge(s)
  return <span className={`badge ${b.className}`}>{b.label}</span>
}
