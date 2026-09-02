import { useEffect, useState } from 'react'
import { reportApi } from '../../api/report'

export default function DeptReport() {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    reportApi.dept({}).then(setData)
  }, [])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
        <h3 style={{ fontWeight: 700 }}>部门合同统计分析</h3>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>部门</th><th>合同数量</th><th>合同金额</th><th>开票金额</th><th>收款金额</th><th>未收款</th><th>已结清数</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.department_name}>
                <td>{r.department_name}</td><td>{r.contract_count}</td><td>{r.contract_amount}</td>
                <td>{r.invoiced_amount}</td><td>{r.received_amount}</td><td>{r.unreceived_amount}</td>
                <td>{r.settled_count}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
