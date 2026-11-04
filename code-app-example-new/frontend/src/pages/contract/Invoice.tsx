import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Search } from 'lucide-react'
import { invoiceApi, type InvoiceContractOption } from '../../api/invoice'
import type { ContractInvoice } from '../../api/contract'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { useAuth } from '../../stores/userStore'
import { amount, money, shortDate, statusClass, text, today } from '../../utils/format'

const STATUS_OPTIONS = [
  { code: 'UNRECEIVED', label: '未收款' },
  { code: 'PARTIAL', label: '部分收款' },
  { code: 'RECEIVED', label: '已收款' },
]

export default function InvoicePage() {
  const { hasPerm } = useAuth()
  const canRegister = hasPerm('PERM-009')
  const [query, setQuery] = useState({
    invoice_no: '',
    contract_no: '',
    contract_name: '',
    receive_status: '',
    invoice_date_from: '',
    invoice_date_to: '',
  })
  const [applied, setApplied] = useState({ ...query })
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [rows, setRows] = useState<ContractInvoice[]>([])
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<InvoiceContractOption[]>([])
  const [form, setForm] = useState({ contract_no: '', stage_no: '', tax_rate: '', invoice_date: today(), remark: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await invoiceApi.list({ ...applied, page, size })
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, applied])

  const openCreate = async () => {
    try {
      const data = await invoiceApi.options()
      setOptions(data)
      setForm({ contract_no: '', stage_no: '', tax_rate: '', invoice_date: today(), remark: '' })
      setOpen(true)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const contract = useMemo(
    () => options.find((item) => item.contract_no === form.contract_no),
    [options, form.contract_no],
  )
  const stage = useMemo(
    () => contract?.stages.find((item) => item.stage_no === form.stage_no),
    [contract, form.stage_no],
  )

  const pickContract = (contractNo: string) => {
    const target = options.find((item) => item.contract_no === contractNo)
    setForm((current) => ({
      ...current,
      contract_no: contractNo,
      stage_no: '',
      tax_rate: target ? String(target.tax_rate) : current.tax_rate,
    }))
  }

  const submit = async () => {
    if (!form.contract_no) return toast('请选择对应合同', 'error')
    if (!form.stage_no) return toast('请选择对应付款阶段', 'error')
    if (form.invoice_date > today()) return toast('开票时间不得晚于当前日期', 'error')
    setSaving(true)
    try {
      const res = await invoiceApi.create({
        contract_no: form.contract_no,
        stage_no: form.stage_no,
        tax_rate: form.tax_rate,
        invoice_date: form.invoice_date,
        remark: form.remark,
      })
      toast(`开票登记成功，开票编号 ${res.invoice_no}`)
      setOpen(false)
      setPage(1)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen-stack">
      <section className="card query-card">
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">开票编号</label>
            <div className="field-control">
              <input value={query.invoice_no} placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, invoice_no: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同编号</label>
            <div className="field-control">
              <input value={query.contract_no} placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, contract_no: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同名称</label>
            <div className="field-control">
              <input value={query.contract_name} placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, contract_name: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">收款状态</label>
            <div className="field-control">
              <select value={query.receive_status} onChange={(e) => setQuery({ ...query, receive_status: e.target.value })}>
                <option value="">全部状态</option>
                {STATUS_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">开票日期</label>
            <div className="field-control range-control">
              <input type="date" max={today()} value={query.invoice_date_from}
                onChange={(e) => setQuery({ ...query, invoice_date_from: e.target.value })} />
              <span className="range-sep">至</span>
              <input type="date" max={today()} value={query.invoice_date_to}
                onChange={(e) => setQuery({ ...query, invoice_date_to: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="query-actions">
          <button className="btn btn-secondary" onClick={() => {
            const empty = { invoice_no: '', contract_no: '', contract_name: '', receive_status: '', invoice_date_from: '', invoice_date_to: '' }
            setQuery(empty); setApplied(empty); setPage(1)
          }}><RotateCcw size={15} />重置</button>
          <button className="btn btn-primary" onClick={() => { setApplied({ ...query }); setPage(1) }}>
            <Search size={15} />查询
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
          <div>
            <h2>合同开票</h2>
            <p>仅已生效合同可开票，同一付款阶段只允许开票一次，开票金额取阶段金额</p>
          </div>
          {canRegister && (
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} />开票登记</button>
          )}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>开票编号</th>
                <th>合同编号</th>
                <th>合同名称</th>
                <th>付款阶段</th>
                <th className="align-right">开票金额</th>
                <th>开票日期</th>
                <th>收款情况</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.invoice_no}>
                  <td className="mono-cell">{row.invoice_no}</td>
                  <td className="mono-cell">{row.contract_no}</td>
                  <td className="strong-cell cell-ellipsis">{row.contract_name}</td>
                  <td>{text(row.stage_name)}</td>
                  <td className="align-right amount-cell">{money(row.invoice_amount)}</td>
                  <td>{shortDate(row.invoice_date)}</td>
                  <td className="stack-cell">
                    <span className={`badge ${statusClass(row.receive_status)}`}>{row.receive_status_label || row.receive_status}</span>
                    <div className="sub-note">已收 {money(row.received_amount)} · 未收 {money(row.unreceived_amount)}</div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="empty-cell">暂无开票记录</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px 16px' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </section>

      <Modal
        title="开票登记"
        open={open}
        onClose={() => setOpen(false)}
        width={620}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>确认开票</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-item span-2">
            <label className="field-label required">对应合同</label>
            <div className="field-control">
              <select value={form.contract_no} onChange={(e) => pickContract(e.target.value)}>
                <option value="">请选择已生效合同</option>
                {options.map((item) => (
                  <option key={item.contract_no} value={item.contract_no}>
                    {item.contract_no} · {item.contract_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label required">付款阶段</label>
            <div className="field-control">
              <select
                value={form.stage_no}
                disabled={!contract}
                onChange={(e) => setForm({ ...form, stage_no: e.target.value })}
              >
                <option value="">{contract ? '请选择未开票付款阶段' : '请先选择合同'}</option>
                {(contract?.stages || []).map((item) => (
                  <option key={item.stage_no} value={item.stage_no}>
                    {item.stage_no}. {item.stage_name}（{item.ratio}% / {money(item.stage_amount)}）
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">开票金额</label>
            <div className="field-control"><input value={stage ? money(stage.stage_amount) : ''} disabled placeholder="按阶段金额自动带出" /></div>
          </div>
          <div className="form-item">
            <label className="field-label">税率(%)</label>
            <div className="field-control">
              <input type="number" min={0} max={100} step="0.01" value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">开票日期</label>
            <div className="field-control">
              <input type="date" max={today()} value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同生效时间</label>
            <div className="field-control"><input value={shortDate(contract?.effective_time)} disabled /></div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">备注</label>
            <div className="field-control">
              <textarea rows={2} maxLength={200} value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
