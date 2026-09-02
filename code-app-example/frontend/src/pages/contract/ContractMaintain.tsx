import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react'
import { contractApi } from '../../api/contract'
import { masterDataApi } from '../../api/masterdata'
import { metaApi, type DictItem } from '../../api/meta'
import PopupSelect from '../../components/PopupSelect'
import { toast } from '../../components/toast'
import { Badge } from '../../utils/status'

const emptyForm = {
  contract_name: '', contract_type: '', product_id: null, customer_id: null,
  department_id: null, sign_date: '', owner_id: null, total_amount: '',
  purchase_amount: '', tax_rate: '',
}

export default function ContractMaintain() {
  const [searchParams, setSearchParams] = useSearchParams()
  const id = searchParams.get('id')
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [contractId, setContractId] = useState<number | null>(id ? Number(id) : null)
  const [contractNo, setContractNo] = useState('')
  const [status, setStatus] = useState('')
  const [stages, setStages] = useState<any[]>([])
  const [contractTypes, setContractTypes] = useState<DictItem[]>([])
  const [display, setDisplay] = useState<any>({ product: '', customer: '', department: '', owner: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    metaApi.dictionaries().then((d) => setContractTypes(d.CONTRACT_TYPE))
  }, [])

  useEffect(() => {
    if (contractId) {
      contractApi.get(contractId).then((c) => {
        setForm({
          contract_name: c.contract_name, contract_type: c.contract_type,
          product_id: c.product_id, customer_id: c.customer_id, department_id: c.department_id,
          sign_date: c.sign_date, owner_id: c.owner_id, total_amount: c.total_amount,
          purchase_amount: c.purchase_amount, tax_rate: c.tax_rate,
        })
        setContractNo(c.contract_no)
        setStatus(c.status)
        setStages((c.stages || []).map((s) => ({ stage_name: s.stage_name, pay_ratio: s.pay_ratio, invoice_status: s.invoice_status })))
        setDisplay({ product: c.product_name || '', customer: c.customer_name || '', department: c.department_name || '', owner: c.owner_name || '' })
      })
    }
  }, [contractId])

  const editable = status === '' || status === '草稿' || status === '已驳回'

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const popupLoader = useCallback((kind: 'product' | 'customer' | 'department' | 'employee') => () => masterDataApi.options(kind), [])

  const totalAmount = Number(form.total_amount) || 0

  const addStage = () => setStages((s) => [...s, { stage_name: '', pay_ratio: '', invoice_status: '未开票' }])
  const removeStage = (i: number) => setStages((s) => s.filter((_, idx) => idx !== i))

  const saveDraft = async (): Promise<number | null> => {
    const payload = { ...form, stages }
    try {
      if (contractId) {
        await contractApi.updateDraft(contractId, payload)
        return contractId
      }
      const c = await contractApi.createDraft(payload)
      setContractId(c.id)
      setContractNo(c.contract_no)
      setSearchParams({ id: String(c.id) })
      return c.id
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
      const c = await contractApi.submit(saved)
      setStatus(c.status)
      toast('提交成功，已启动合同登记审批')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setForm({ ...emptyForm })
    setStages([])
    setContractId(null)
    setContractNo('')
    setStatus('')
    setDisplay({ product: '', customer: '', department: '', owner: '' })
    setSearchParams({})
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>合同维护（主从表）</h2>
        <div className="toolbar">
          {status && <Badge status={status} />}
          <button className="btn btn-secondary" onClick={handleReset}><RotateCcw size={14} /> 重置</button>
          <button className="btn btn-secondary" onClick={handleDraft} disabled={!editable}><Save size={14} /> 暂存</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!editable || loading}><Send size={14} /> 提交</button>
        </div>
      </div>

      <div className="form-grid-3" style={{ marginBottom: 24 }}>
        <div className="form-item">
          <label className="field-label">合同编号</label>
          <div className="field-control"><input value={contractNo || '（保存后自动生成）'} readOnly disabled /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">合同名称</label>
          <div className="field-control"><input value={form.contract_name} disabled={!editable} onChange={(e) => set('contract_name', e.target.value)} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">合同类型</label>
          <div className="field-control">
            <select value={form.contract_type} disabled={!editable} onChange={(e) => set('contract_type', e.target.value)}>
              <option value="">请选择</option>
              {contractTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">所属产品</label>
          <div className="field-control">
            <PopupSelect value={form.product_id} display={display.product} disabled={!editable} title="选择产品"
              fetchOptions={popupLoader('product')} onSelect={(o) => { set('product_id', o.id); setDisplay((d: any) => ({ ...d, product: o.name || o.no })) }} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">所属客户</label>
          <div className="field-control">
            <PopupSelect value={form.customer_id} display={display.customer} disabled={!editable} title="选择客户"
              fetchOptions={popupLoader('customer')} onSelect={(o) => { set('customer_id', o.id); setDisplay((d: any) => ({ ...d, customer: o.name || o.no })) }} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">签订时间</label>
          <div className="field-control"><input type="date" value={form.sign_date} disabled={!editable} onChange={(e) => set('sign_date', e.target.value)} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">所属部门</label>
          <div className="field-control">
            <PopupSelect value={form.department_id} display={display.department} disabled={!editable} title="选择部门"
              fetchOptions={popupLoader('department')} onSelect={(o) => { set('department_id', o.id); setDisplay((d: any) => ({ ...d, department: o.name || o.no })) }} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">责任人</label>
          <div className="field-control">
            <PopupSelect value={form.owner_id} display={display.owner} disabled={!editable} title="选择人员"
              fetchOptions={popupLoader('employee')} onSelect={(o) => { set('owner_id', o.id); setDisplay((d: any) => ({ ...d, owner: o.name || o.no })) }} />
          </div>
        </div>
        <div className="form-item">
          <label className="field-label required">合同税率</label>
          <div className="field-control"><input type="number" step="0.01" value={form.tax_rate} disabled={!editable} onChange={(e) => set('tax_rate', e.target.value)} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">合同总金额</label>
          <div className="field-control"><input type="number" value={form.total_amount} disabled={!editable} onChange={(e) => set('total_amount', e.target.value)} /></div>
        </div>
        <div className="form-item">
          <label className="field-label required">采购金额</label>
          <div className="field-control"><input type="number" value={form.purchase_amount} disabled={!editable} onChange={(e) => set('purchase_amount', e.target.value)} /></div>
        </div>
      </div>

      <div className="flex-between" style={{ marginBottom: 8 }}>
        <h3 style={{ fontWeight: 700 }}>付款阶段（从表）</h3>
        <button className="btn btn-secondary btn-sm" disabled={!editable} onClick={addStage}><Plus size={14} /> 添加行</button>
      </div>
      <div className="table-container" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>阶段编号</th><th>阶段名称</th><th>付款比例(%)</th><th>阶段应付金额</th><th>开票状态</th><th>操作</th></tr></thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input className="table-input" disabled={!editable} value={s.stage_name} onChange={(e) => setStages(stages.map((x, j) => j === i ? { ...x, stage_name: e.target.value } : x))} /></td>
                <td><input className="table-input" type="number" disabled={!editable} value={s.pay_ratio} onChange={(e) => setStages(stages.map((x, j) => j === i ? { ...x, pay_ratio: e.target.value } : x))} /></td>
                <td>{((totalAmount * Number(s.pay_ratio || 0)) / 100).toFixed(2)}</td>
                <td>{s.invoice_status ? <Badge status={s.invoice_status} /> : '-'}</td>
                <td><button className="btn btn-secondary btn-sm" disabled={!editable} onClick={() => removeStage(i)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
            {stages.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>请添加付款阶段</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
