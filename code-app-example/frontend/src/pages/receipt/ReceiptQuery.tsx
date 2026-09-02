import { useEffect, useState } from 'react'
import { RotateCcw, Search, Undo2 } from 'lucide-react'
import { receiptApi, type Receipt } from '../../api/receipt'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { Badge } from '../../utils/status'

export default function ReceiptQuery() {
  const [filters, setFilters] = useState<any>({ receipt_no: '' })
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)

  const load = async () => {
    const res = await receiptApi.list({ page, size, ...filters })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  const handleReverse = async (r: Receipt) => {
    if (!window.confirm(`确认冲销收款「${r.receipt_no}」？`)) return
    try {
      await receiptApi.reverse(r.id)
      toast('冲销成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">收款编号</label>
            <div className="field-control"><input value={filters.receipt_no} onChange={(e) => setFilters({ ...filters, receipt_no: e.target.value })} /></div>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setPage(1); load() }}><Search size={14} /> 查询</button>
          <button className="btn btn-secondary" onClick={() => { setFilters({ receipt_no: '' }); setPage(1) }}><RotateCcw size={14} /> 重置</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead><tr><th>收款编号</th><th>合同</th><th>开票</th><th>收款金额</th><th>收款时间</th><th>方式</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.receipt_no}</td>
                  <td>{r.contract_no || '-'}</td>
                  <td>{r.invoice_no || '-'}</td>
                  <td>{r.receipt_amount}</td>
                  <td>{r.receipt_time}</td>
                  <td>{r.receipt_method}</td>
                  <td><Badge status={r.status} /></td>
                  <td>
                    {r.status === '已登记' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleReverse(r)}><Undo2 size={14} /> 冲销</button>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}
