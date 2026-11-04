import { useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { reportApi, type ReportResult } from '../../api/report'
import { masterdataApi, type ContractOptions } from '../../api/masterdata'
import { toast } from '../../components/toast'
import { money, monthStart, today } from '../../utils/format'

export default function DepartmentReport() {
  const [base, setBase] = useState<ContractOptions | null>(null)
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    masterdataApi.options().then(setBase).catch(() => {})
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const departments = useMemo(() => base?.departments || [], [base])

  const params = () => ({
    start_date: start,
    end_date: end,
    depts: selected.join(','),
  })

  const search = async () => {
    if (!start || !end) return toast('请选择统计时间段', 'error')
    if (end < start) return toast('统计截止时间不得早于起始时间', 'error')
    setLoading(true)
    try {
      setResult(await reportApi.query(params()))
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const doExport = async () => {
    if (!start || !end) return toast('请选择统计时间段', 'error')
    setExporting(true)
    try {
      await reportApi.export(params())
      toast('报表已导出')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const toggleDept = (deptNo: string) => {
    setSelected((current) =>
      current.includes(deptNo) ? current.filter((item) => item !== deptNo) : [...current, deptNo],
    )
  }

  const rows = result?.list || []
  const totalRow = result?.total_row

  return (
    <div className="screen-stack">
      <section className="card query-card">
        <div className="form-grid-3">
          <div className="form-item span-2">
            <label className="field-label">统计时间段</label>
            <div className="field-control range-control">
              <input type="date" value={start} max={today()} onChange={(e) => setStart(e.target.value)} />
              <span className="range-sep">至</span>
              <input type="date" value={end} max={today()} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="form-item span-3">
            <label className="field-label">统计部门</label>
            <div className="field-control chip-group">
              <button
                className={`chip ${!selected.length ? 'active' : ''}`}
                onClick={() => setSelected([])}
              >
                全部（权限范围内）
              </button>
              {departments.map((item) => (
                <button
                  key={item.code}
                  className={`chip ${selected.includes(item.code) ? 'active' : ''}`}
                  onClick={() => toggleDept(item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="query-actions">
          <button className="btn btn-secondary" disabled={exporting || !rows.length} onClick={doExport}>
            <Download size={15} />导出 Excel
          </button>
          <button className="btn btn-primary" disabled={loading} onClick={search}>
            <Search size={15} />查询
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
          <div>
            <h2>部门合同统计分析</h2>
            <p>
              统计时间段 {result?.criteria?.start_date || start} 至 {result?.criteria?.end_date || end}
              ；签订金额不含草稿，未收款金额为统计期末余额
            </p>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="number-col">序号</th>
                <th>部门编号</th>
                <th>部门名称</th>
                <th className="align-right">合同签订总金额</th>
                <th className="align-right">开票总金额</th>
                <th className="align-right">已开票未收款金额</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dept_no}>
                  <td>{row.seq}</td>
                  <td className="mono-cell">{row.dept_no}</td>
                  <td className="strong-cell">{row.dept_name}</td>
                  <td className="align-right amount-cell">{money(row.sign_amount)}</td>
                  <td className="align-right amount-cell">{money(row.invoice_amount)}</td>
                  <td className="align-right amount-cell">{money(row.unreceived_amount)}</td>
                </tr>
              ))}
              {totalRow && rows.length > 0 && (
                <tr className="total-row">
                  <td colSpan={3}>合计</td>
                  <td className="align-right">{money(totalRow.sign_amount)}</td>
                  <td className="align-right">{money(totalRow.invoice_amount)}</td>
                  <td className="align-right">{money(totalRow.unreceived_amount)}</td>
                </tr>
              )}
              {!rows.length && (
                <tr><td colSpan={6} className="empty-cell">{loading ? '统计中…' : '请选择统计条件后查询'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="report-note">
          <span>口径说明</span>
          <ul>
            <li>合同签订总金额：签订时间落在统计区间内，且状态为审批中 / 已生效 / 已关闭的合同总金额，草稿不计入。</li>
            <li>开票总金额：开票时间落在统计区间内的开票金额合计。</li>
            <li>已开票未收款金额：区间内开票金额减去截至统计截止时间已登记的收款金额，结果不小于 0。</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
