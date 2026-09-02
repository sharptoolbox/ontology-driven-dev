import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Undo2 } from 'lucide-react'
import { workbenchApi, type RequestedItem } from '../../api/workbench'
import { contractApi } from '../../api/contract'
import { invoiceApi } from '../../api/invoice'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { Badge } from '../../utils/status'

const BIZ_LABEL: Record<string, string> = { CONTRACT: '合同', INVOICE: '开票' }

export default function Requested() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<RequestedItem[]>([])
  const [total, setTotal] = useState(0)

  const load = async () => {
    const res = await workbenchApi.requested({ page, size })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  const view = (r: RequestedItem) => {
    const path = r.biz_type === 'INVOICE' ? '/invoice/maintain' : '/contract/maintain'
    navigate(`${path}?id=${r.biz_id}`)
  }

  const withdraw = async (r: RequestedItem) => {
    if (!window.confirm(`确认撤回「${r.biz_name}」？`)) return
    try {
      if (r.biz_type === 'INVOICE') await invoiceApi.withdraw(r.biz_id)
      else await contractApi.withdraw(r.biz_id)
      toast('已撤回')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const canWithdraw = (r: RequestedItem) => r.biz_status === '待财务经理审批' && r.status === 'RUNNING'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>我的申请</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>业务类型</th><th>业务编号</th><th>业务名称</th><th>业务状态</th><th>申请时间</th><th>操作</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{BIZ_LABEL[r.biz_type] || r.biz_type}</td>
                <td>{r.biz_no}</td>
                <td>{r.biz_name || '-'}</td>
                <td>{r.biz_status ? <Badge status={r.biz_status} /> : '-'}</td>
                <td>{r.started_at}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => view(r)}><Eye size={14} /> 查看</button>
                  {canWithdraw(r) && (
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => withdraw(r)}><Undo2 size={14} /> 撤回</button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无申请</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
