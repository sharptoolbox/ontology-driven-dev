import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Search } from 'lucide-react'
import { receiptApi, type ReceiptContractOption } from '../../api/receipt'
import type { ContractReceipt } from '../../api/contract'
import { masterdataApi, type ContractOptions } from '../../api/masterdata'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { useAuth } from '../../stores/userStore'
import { money, shortDate, statusClass, text, today } from '../../utils/format'

export default function ReceiptPage() {
  const { hasPerm } = useAuth()
  const canRegister = hasPerm('PERM-011')
  const [query, setQuery] = useState({
    receive_no: '',
    contract_no: '',
    invoice_no: '',
    receive_method: '',
    receive_date_from: '',
    receive_date_to: '',
  })
  const [applied, setApplied] = useState({ ...query })
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [rows, setRows] = useState<ContractReceipt[]>([])
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ReceiptContractOption[]>([])
  const [base, setBase] = useState<ContractOptions | null>(null)
  const [form, setForm] = useState({
    contract_no: '',
    invoice_no: '',
    receive_amount: '',
    receive_date: today(),
    receive_method: 'BANK_TRANSFER',
    remark: '',
  })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await receiptApi.list({ ...applied, page, size })
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

  useEffect(() => {
    masterdataApi.options().then(setBase).catch(() => {})
  }, [])

  const openCreate = async () => {
    try {
      const data = await receiptApi.options()
      setOptions(data)
      setForm({ contract_no: '', invoice_no: '', receive_amount: '', receive_date: today(), receive_method: 'BANK_TRANSFER', remark: '' })
      setOpen(true)
      if (!data.length) toast('当前没有可登记收款的开票记录', 'error')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const contract = useMemo(
    () => options.find((item) => item.contract_no === form.contract_no),
    [options, form.contract_no],
  )
  const invoice = useMemo(
    () => contract?.invoices.find((item) => item.invoice_no === form.invoice_no),
    [contract, form.invoice_no],
  )

  const pickContract = (contractNo: string) =>
    setForm((current) => ({ ...current, contract_no: contractNo, invoice_no: '', receive_amount: '' }))

  const pickInvoice = (invoiceNo: string) => {
    const target = contract?.invoices.find((item) => item.invoice_no === invoiceNo)
    setForm((current) => ({
      ...current,
      invoice_no: invoiceNo,
      receive_amount: target ? String(target.unreceived_amount) : current.receive_amount,
    }))
  }

  const submit = async () => {
    if (!form.contract_no) return toast('请选择对应合同', 'error')
    if (!form.invoice_no) return toast('请选择对应开票', 'error')
    const amountValue = Number(form.receive_amount)
    if (!(amountValue > 0)) return toast('收款金额必须大于 0', 'error')
    if (invoice && amountValue > Number(invoice.unreceived_amount) + 0.001) {
      return toast(`本次收款金额不得超过该开票未收款金额 ${money(invoice.unreceived_amount)} 元`, 'error')
    }
    if (form.receive_date > today()) return toast('收款时间不得晚于当前日期', 'error')
    if (invoice && form.receive_date < invoice.invoice_date) return toast('收款时间不得早于开票时间', 'error')
    setSaving(true)
    try {
      const res = await receiptApi.create({
        contract_no: form.contract_no,
        invoice_no: form.invoice_no,
        receive_amount: amountValue,
        receive_date: form.receive_date,
        receive_method: form.receive_method,
        remark: form.remark,
      })
      toast(res.contract_closed ? '收款登记成功，该合同全部款项已收齐，合同已自动关闭' : '收款登记成功')
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
            <label className="field-label">收款编号</label>
            <div className="field-control">
              <input value={query.receive_no} placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, receive_no: e.target.value })} />
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
            <label className="field-label">开票编号</label>
            <div className="field-control">
              <input value={query.invoice_no} placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, invoice_no: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">收款方式</label>
            <div className="field-control">
              <select value={query.receive_method} onChange={(e) => setQuery({ ...query, receive_method: e.target.value })}>
                <option value="">全部方式</option>
                {(base?.receive_methods || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">收款日期</label>
            <div className="field-control range-control">
              <input type="date" max={today()} value={query.receive_date_from}
                onChange={(e) => setQuery({ ...query, receive_date_from: e.target.value })} />
              <span className="range-sep">至</span>
              <input type="date" max={today()} value={query.receive_date_to}
                onChange={(e) => setQuery({ ...query, receive_date_to: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="query-actions">
          <button className="btn btn-secondary" onClick={() => {
            const empty = { receive_no: '', contract_no: '', invoice_no: '', receive_method: '', receive_date_from: '', receive_date_to: '' }
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
            <h2>合同收款</h2>
            <p>一笔开票可分批收款，收款金额不得超过开票未收款金额；全部收齐后合同自动关闭</p>
          </div>
          {canRegister && (
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} />收款登记</button>
          )}
        </div>
        <div className="table-container">
          <table className="table-fit">
            <colgroup>
              <col style={{ width: 126 }} />
              <col style={{ width: 122 }} />
              <col />
              <col style={{ width: 122 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 106 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 112 }} />
            </colgroup>
            <thead>
              <tr>
                <th>收款编号</th>
                <th>合同编号</th>
                <th>合同名称</th>
                <th>对应开票</th>
                <th className="align-right">收款金额</th>
                <th>收款日期</th>
                <th>收款方式</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.receive_no}>
                  <td className="mono-cell">{row.receive_no}</td>
                  <td className="mono-cell">{row.contract_no}</td>
                  <td className="strong-cell" title={row.contract_name}>{row.contract_name}</td>
                  <td className="mono-cell">{row.invoice_no}</td>
                  <td className="align-right amount-cell">{money(row.receive_amount)}</td>
                  <td>{shortDate(row.receive_date)}</td>
                  <td className="stack-cell">
                    {text((base?.receive_methods || []).find((m) => m.code === row.receive_method)?.label || row.receive_method)}
                    <div className="sub-note">登记人 {text(row.receive_by)}</div>
                  </td>
                  <td title={row.remark || ''}>{text(row.remark)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="empty-cell">暂无收款记录</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px 16px' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </section>

      <Modal
        title="收款登记"
        open={open}
        onClose={() => setOpen(false)}
        width={620}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>确认收款</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-item span-2">
            <label className="field-label required">对应合同</label>
            <div className="field-control">
              <select value={form.contract_no} onChange={(e) => pickContract(e.target.value)}>
                <option value="">请选择已生效 / 已关闭合同</option>
                {options.map((item) => (
                  <option key={item.contract_no} value={item.contract_no}>
                    {item.contract_no} · {item.contract_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label required">对应开票</label>
            <div className="field-control">
              <select value={form.invoice_no} disabled={!contract} onChange={(e) => pickInvoice(e.target.value)}>
                <option value="">{contract ? '请选择未收款 / 部分收款开票' : '请先选择合同'}</option>
                {(contract?.invoices || []).map((item) => (
                  <option key={item.invoice_no} value={item.invoice_no}>
                    {item.invoice_no} · 开票 {money(item.invoice_amount)} · 未收 {money(item.unreceived_amount)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">开票金额</label>
            <div className="field-control"><input value={invoice ? money(invoice.invoice_amount) : ''} disabled /></div>
          </div>
          <div className="form-item">
            <label className="field-label">未收款金额</label>
            <div className="field-control"><input value={invoice ? money(invoice.unreceived_amount) : ''} disabled /></div>
          </div>
          <div className="form-item">
            <label className="field-label required">收款金额</label>
            <div className="field-control">
              <input type="number" min={0} step="0.01" value={form.receive_amount}
                onChange={(e) => setForm({ ...form, receive_amount: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">收款日期</label>
            <div className="field-control">
              <input type="date" max={today()} value={form.receive_date}
                onChange={(e) => setForm({ ...form, receive_date: e.target.value })} />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">收款方式</label>
            <div className="field-control">
              <select value={form.receive_method} onChange={(e) => setForm({ ...form, receive_method: e.target.value })}>
                {(base?.receive_methods || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">收款状态</label>
            <div className="field-control">
              {invoice ? <span className={`badge ${statusClass(invoice.receive_status)}`}>{invoice.receive_status_label || invoice.receive_status}</span> : '-'}
            </div>
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
