import { useEffect, useState } from 'react'
import { workbenchApi, type DoneItem } from '../../api/workbench'
import Pagination from '../../components/Pagination'
import { statusBadge } from '../../utils/status'

const BIZ_LABEL: Record<string, string> = { CONTRACT: '合同', INVOICE: '开票' }
const ACTION_LABEL: Record<string, string> = { APPROVE: '通过', REJECT: '驳回', RETURN: '退回' }

export default function Done() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<DoneItem[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    workbenchApi.done({ page, size }).then((res) => { setData(res.list); setTotal(res.total) })
  }, [page, size])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>我的已办</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>业务类型</th><th>业务编号</th><th>业务名称</th><th>审批节点</th><th>处理结果</th><th>审批意见</th><th>处理时间</th></tr></thead>
          <tbody>
            {data.map((t) => {
              const action = statusBadge(t.action || '')
              return (
                <tr key={t.id}>
                  <td>{BIZ_LABEL[t.biz_type] || t.biz_type}</td>
                  <td>{t.biz_no}</td>
                  <td>{t.biz_name || '-'}</td>
                  <td>{t.activity_name}</td>
                  <td><span className={`badge ${action.className}`}>{ACTION_LABEL[t.action || ''] || action.label}</span></td>
                  <td>{t.comment || '-'}</td>
                  <td>{t.done_at || '-'}</td>
                </tr>
              )
            })}
            {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无已办</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
