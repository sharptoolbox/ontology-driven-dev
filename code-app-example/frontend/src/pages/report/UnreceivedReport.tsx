import { useEffect, useState } from 'react'
import { reportApi } from '../../api/report'
import Pagination from '../../components/Pagination'

export default function UnreceivedReport() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    reportApi.unreceived({ page, size }).then((res) => { setData(res.list); setTotal(res.total) })
  }, [page, size])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>已开票未收款分析</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>合同编号</th><th>开票编号</th><th>开票金额</th><th>已收款</th><th>未收款</th><th>最近收款时间</th></tr></thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td>{r.contract_no}</td><td>{r.invoice_no}</td><td>{r.invoice_amount}</td>
                <td>{r.received_amount}</td><td>{r.outstanding_amount}</td><td>{r.latest_receipt_time || '-'}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
