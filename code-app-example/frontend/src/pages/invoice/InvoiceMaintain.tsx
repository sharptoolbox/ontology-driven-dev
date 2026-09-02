import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react'
import { contractApi } from '../../api/contract'
import { invoiceApi } from '../../api/invoice'
import PopupSelect from '../../components/PopupSelect'
import { toast } from '../../components/toast'
import { Badge } from '../../utils/status'

const emptyForm = { contract_id: null, invoice_amount: '', invoice_tax_rate: '', invoice_date: '' }

export default function InvoiceMaintain() {
  const [searchParams, setSearchParams] = useSearchParams()
  const id = searchParams.get('id')
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [invoiceId, setInvoiceId] = useState<number | null>(id ? Number(id) : null)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [status, setStatus] = useState('')
  const [allocations, setAllocations] = useState<any[]>([])
  const [contractStages, setContractStages] = useState<any[]>([])
  const [contractDisplay, setContractDisplay] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (invoiceId) {
      invoiceApi.get(invoiceId).then((inv) => {
        setForm({ contract_id: inv.contract_id, invoice_amount: inv.invoice_amount, invoice_tax_rate: inv.invoice_tax_rate, invoice_date: inv.invoice_date })
        setInvoiceNo(inv.invoice_no)
        setStatus(inv.approval_status)
        setContractDisplay(inv.contract_no || '')
        setAllocations((inv.allocations || []).map((a: any) => ({ stage_id: a.stage_id, allocated_amount: a.allocated_amount })))
        if (inv.contract_id) loadStages(inv.contract_id)
      })
    }
  }, [invoiceId])

  const editable = status === '' || status === '草稿' || status === '已驳回'

  const loadStages = async (contractId: number) => {
    const c = await contractApi.get(contractId)
    setContractStages(c.stages || [])
  }

  const onSelectContract = async (o: any) => {
    const cid = o.id
    setForm((f: any) => ({ ...f, contract_id: cid }))
    setContractDisplay(o.name || o.no || '')
    const c = await contractApi.get(cid)
    setContractStages(c.stages || [])
    if (!form.invoice_tax_rate) setForm((f: any) => ({ ...f, invoice_tax_rate: c.tax_rate }))
    setAllocations([])
  }

  const addAlloc = () => setAllocations((a) => [...a, { stage_id: '', allocated_amount: '' }])
  const removeAlloc = (i: number) => setAllocations((a) => a.filter((_, idx) => idx !== i))

  const saveDraft = async (): Promise<number | null> => {
    try {
      const payload = { ...form, allocations }
      if (invoiceId) {
        await invoiceApi.updateDraft(invoiceId, payload)
        return invoiceId
      }
      const inv = await invoiceApi.createDraft(payload)
      setInvoiceId(inv.id)
      setInvoiceNo(inv.invoice_no)
      setSearchParams({ id: String(inv.id) })
      return inv.id
    } catch (err: any) {
      toast(err.message, 'error')
      return null
    }
  }

  const handleDraft = async () => {
    const saved = await saveDraft()
    if (saved) { setStatus('草稿'); toast('暂存成功') }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const saved = await saveDraft()
      if (!saved) return
      const inv = await invoiceApi.submit(saved)
      setStatus(inv.approval_status)
      toast('提交成功，已启动开票审批')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setForm({ ...emptyForm }); setAllocations([]); setInvoiceId(null); setInvoiceNo(''); setStatus('')
    setContractStages([]); setContractDisplay(''); setSearchParams({})
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>开票录入（主从表）</h2>
        <div className="toolbar">
          {status && <Badge status={status} />}
          <button className="btn btn-secondary" onClick={handleReset}><RotateCcw size={14} /> 重置</button>
          <button className="btn btn-secondary" onClick={handleDraft} disabled={!editable}><Save size={14} /> 暂存</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!editable || loading}><Send size={14} /> 提交</button>
        </div>
      </div>

      <div className="form-grid-3" style={{ marginBottom: 24 }}>
        <div className="form-item">
          <label className="field-label">开票编号</label>
          <div className="field-control"><input value={invoiceNo || '（保存后自动生成）'} readOnly disabled /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">对应合同</label>
          <div className="field-control">
            <PopupSelect value={form.contract_id} display={contractDisplay} disabled={!editable} title="选择合同"
              fetchOptions={contractApi.options} onSelect={onSelectContract} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">开票时间</label>
          <div className="field-control"><input type="date" value={form.invoice_date} disabled={!editable} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">开票金额</label>
          <div className="field-control"><input type="number" value={form.invoice_amount} disabled={!editable} onChange={(e) => setForm({ ...form, invoice_amount: e.target.value })} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">开票税率</label>
          <div className="field-control"><input type="number" step="0.01" value={form.invoice_tax_rate} disabled={!editable} onChange={(e) => setForm({ ...form, invoice_tax_rate: e.target.value })} /></div>
        </div>
      </div>

      <div className="flex-between" style={{ marginBottom: 8 }}>
        <h3 style={{ fontWeight: 700 }}>付款阶段分摊（从表）</h3>
        <button className="btn btn-secondary btn-sm" disabled={!editable || !form.contract_id} onClick={addAlloc}><Plus size={14} /> 添加行</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>付款阶段</th><th>阶段应付金额</th><th>本次分摊金额</th><th>操作</th></tr></thead>
          <tbody>
            {allocations.map((a, i) => {
              const stage = contractStages.find((s) => s.stage_id === a.stage_id)
              return (
                <tr key={i}>
                  <td>
                    <select className="table-input" disabled={!editable} value={a.stage_id}
                      onChange={(e) => setAllocations(allocations.map((x, j) => j === i ? { ...x, stage_id: e.target.value } : x))}>
                      <option value="">请选择</option>
                      {contractStages.map((s) => <option key={s.stage_id} value={s.stage_id}>{s.stage_id} - {s.stage_name}</option>)}
                    </select>
                  </td>
                  <td>{stage?.stage_amount ?? '-'}</td>
                  <td><input className="table-input" type="number" disabled={!editable} value={a.allocated_amount}
                    onChange={(e) => setAllocations(allocations.map((x, j) => j === i ? { ...x, allocated_amount: e.target.value } : x))} /></td>
                  <td><button className="btn btn-secondary btn-sm" disabled={!editable} onClick={() => removeAlloc(i)}><Trash2 size={14} /></button></td>
                </tr>
              )
            })}
            {allocations.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>请添加分摊行</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
