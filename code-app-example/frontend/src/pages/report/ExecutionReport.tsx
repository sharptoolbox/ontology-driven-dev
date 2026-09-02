import { useEffect, useState } from 'react'
import { reportApi } from '../../api/report'
import Pagination from '../../components/Pagination'

export default function ExecutionReport() {
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    reportApi.execution({ page, size }).then((res) => { setData(res.list); setTotal(res.total) })
  }, [page, size])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>合同执行情况分析</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>合同编号</th><th>合同名称</th><th>合同金额</th><th>累计开票</th><th>累计收款</th><th>未收款</th><th>收款完成率</th></tr></thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td>{r.contract_no}</td><td>{r.contract_name}</td><td>{r.total_amount}</td>
                <td>{r.invoiced_amount}</td><td>{r.received_amount}</td><td>{r.unreceived_amount}</td>
                <td>{(r.receipt_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination page={page} size={size} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
