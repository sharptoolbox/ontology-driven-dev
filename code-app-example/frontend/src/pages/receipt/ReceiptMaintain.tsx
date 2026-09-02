import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { contractApi } from '../../api/contract'
import { invoiceApi } from '../../api/invoice'
import { metaApi, type DictItem } from '../../api/meta'
import { receiptApi } from '../../api/receipt'
import PopupSelect from '../../components/PopupSelect'
import { toast } from '../../components/toast'

const emptyForm = { contract_id: null, invoice_id: null, receipt_amount: '', receipt_time: '', receipt_method: '', remark: '' }

export default function ReceiptMaintain() {
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [contractDisplay, setContractDisplay] = useState('')
  const [invoiceDisplay, setInvoiceDisplay] = useState('')
  const [methods, setMethods] = useState<DictItem[]>([])

  useEffect(() => { metaApi.dictionaries().then((d) => setMethods(d.RECEIPT_METHOD)) }, [])

  const onSelectContract = (o: any) => {
    setForm((f: any) => ({ ...f, contract_id: o.id }))
    setContractDisplay(o.name || o.no || '')
  }

  const onSelectInvoice = (inv: any) => {
    setForm((f: any) => ({
      ...f,
      invoice_id: inv.id,
      contract_id: inv.contract_id ?? null,
      receipt_amount: inv.amount ?? '',
    }))
    setInvoiceDisplay(inv.no || '')
    setContractDisplay(inv.contract_name || inv.contract_no || '')
  }

  const handleSave = async () => {
    try {
      const r = await receiptApi.record(form)
      toast(`收款登记成功：${r.receipt_no}`)
      handleReset()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleReset = () => { setForm({ ...emptyForm }); setContractDisplay(''); setInvoiceDisplay('') }

  return (
    <div className="card">
      <div className="card-title">
        <h2>收款录入</h2>
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={handleReset}><RotateCcw size={14} /> 重置</button>
          <button className="btn btn-primary" onClick={handleSave}><Save size={14} /> 保存</button>
        </div>
      </div>
      <div className="form-grid-2">
        <div className="form-item">
          <label className="field-label required">对应合同</label>
          <div className="field-control">
            <PopupSelect value={form.contract_id} display={contractDisplay} title="选择合同" fetchOptions={contractApi.options} onSelect={onSelectContract} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">对应开票</label>
          <div className="field-control">
            <PopupSelect
              value={form.invoice_id}
              display={invoiceDisplay}
              title="选择开票"
              columns={[
                { key: 'no', label: '开票编号' },
                { key: 'contract_no', label: '对应合同' },
                { key: 'amount', label: '开票金额' },
              ]}
              fetchOptions={invoiceApi.options}
              onSelect={onSelectInvoice}
            />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">收款金额</label>
          <div className="field-control"><input type="number" value={form.receipt_amount} onChange={(e) => setForm({ ...form, receipt_amount: e.target.value })} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">收款时间</label>
          <div className="field-control"><input type="datetime-local" value={form.receipt_time} onChange={(e) => setForm({ ...form, receipt_time: e.target.value.replace('T', ' ') })} /></div>
        </div>
        <div className="form-item">
          <label className="field-label">收款方式</label>
          <div className="field-control">
            <select value={form.receipt_method} onChange={(e) => setForm({ ...form, receipt_method: e.target.value })}>
              <option value="">请选择</option>
              {methods.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-item span-2">
          <label className="field-label">备注</label>
          <div className="field-control"><textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
        </div>
      </div>
    </div>
  )
}
