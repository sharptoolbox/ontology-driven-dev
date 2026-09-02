import { useEffect, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { contractApi } from '../../api/contract'
import { invoiceApi, type Invoice } from '../../api/invoice'
import { metaApi } from '../../api/meta'
import Pagination from '../../components/Pagination'
import PopupSelect from '../../components/PopupSelect'
import { Badge } from '../../utils/status'

export default function InvoiceQuery() {
  const [filters, setFilters] = useState<any>({ invoice_no: '', contract_id: null, approval_status: '' })
  const [contractDisplay, setContractDisplay] = useState('')
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [statuses, setStatuses] = useState<string[]>([])

  useEffect(() => { metaApi.invoiceStatus().then(setStatuses) }, [])

  const load = async () => {
    const res = await invoiceApi.list({ page, size, ...filters })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">开票编号</label>
            <div className="field-control"><input value={filters.invoice_no} onChange={(e) => setFilters({ ...filters, invoice_no: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">对应合同</label>
            <div className="field-control">
              <PopupSelect value={filters.contract_id} display={contractDisplay} title="选择合同" fetchOptions={contractApi.options}
                onSelect={(o) => { setFilters({ ...filters, contract_id: o.id }); setContractDisplay(o.name || o.no || '') }} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">开票状态</label>
            <div className="field-control">
              <select value={filters.approval_status} onChange={(e) => setFilters({ ...filters, approval_status: e.target.value })}>
                <option value="">全部</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setPage(1); load() }}><Search size={14} /> 查询</button>
          <button className="btn btn-secondary" onClick={() => { setFilters({ invoice_no: '', contract_id: null, approval_status: '' }); setContractDisplay(''); setPage(1) }}><RotateCcw size={14} /> 重置</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead><tr><th>开票编号</th><th>合同</th><th>开票金额</th><th>税率</th><th>开票日期</th><th>已收款</th><th>状态</th></tr></thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoice_no}</td>
                  <td>{i.contract_no || '-'}</td>
                  <td>{i.invoice_amount}</td>
                  <td>{i.invoice_tax_rate}</td>
                  <td>{i.invoice_date}</td>
                  <td>{i.received_amount}</td>
                  <td><Badge status={i.approval_status} /></td>
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
    </div>
  )
}
