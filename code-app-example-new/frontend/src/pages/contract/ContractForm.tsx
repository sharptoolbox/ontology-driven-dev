import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react'
import { contractApi, type ContractOption } from '../../api/contract'
import { toast } from '../../components/toast'
import { money, today } from '../../utils/format'

interface StageDraft {
  key: string
  stage_name: string
  ratio: string
  pay_condition: string
  remark: string
  invoice_status?: string
}

const newStage = (): StageDraft => ({
  key: Math.random().toString(36).slice(2),
  stage_name: '',
  ratio: '',
  pay_condition: '',
  remark: '',
})

export default function ContractForm() {
  const navigate = useNavigate()
  const { contractNo } = useParams()
  const isEdit = Boolean(contractNo)

  const [options, setOptions] = useState<ContractOption | null>(null)
  const [noPreview, setNoPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    contract_name: '',
    product_no: '',
    customer_no: '',
    dept_no: '',
    contract_type: '',
    sign_date: today(),
    owner_no: '',
    total_amount: '',
    purchase_amount: '',
    tax_rate: '13',
    remark: '',
  })
  const [stages, setStages] = useState<StageDraft[]>([newStage()])

  useEffect(() => {
    Promise.all([contractApi.options(), isEdit ? Promise.resolve(null) : contractApi.prefill()])
      .then(([opt, prefill]) => {
        setOptions(opt)
        if (prefill) setNoPreview(prefill.contract_no)
      })
      .catch((err) => toast(err.message, 'error'))
  }, [isEdit])

  useEffect(() => {
    if (!isEdit) {
      setLoading(false)
      return
    }
    contractApi
      .detail(contractNo as string)
      .then((detail) => {
        setNoPreview(detail.contract_no)
        setForm({
          contract_name: detail.contract_name,
          product_no: detail.product_no,
          customer_no: detail.customer_no,
          dept_no: detail.dept_no,
          contract_type: detail.contract_type,
          sign_date: detail.sign_date,
          owner_no: detail.owner_no,
          total_amount: String(detail.total_amount ?? ''),
          purchase_amount: String(detail.purchase_amount ?? ''),
          tax_rate: String(detail.tax_rate ?? ''),
          remark: detail.remark || '',
        })
        setStages(
          (detail.stages || []).map((stage) => ({
            key: Math.random().toString(36).slice(2),
            stage_name: stage.stage_name,
            ratio: String(stage.ratio),
            pay_condition: stage.pay_condition,
            remark: stage.remark || '',
            invoice_status: stage.invoice_status,
          })),
        )
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [contractNo, isEdit])

  const total = Number(form.total_amount || 0)
  const ratioSum = useMemo(
    () => stages.reduce((sum, stage) => sum + Number(stage.ratio || 0), 0),
    [stages],
  )
  const stageAmounts = useMemo(
    () => stages.map((stage) => Math.round(total * Number(stage.ratio || 0)) / 100),
    [stages, total],
  )
  const amountSum = stageAmounts.reduce((sum, value) => sum + value, 0)

  const updateStage = (key: string, patch: Partial<StageDraft>) =>
    setStages((current) => current.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)))

  const removeStage = (key: string) => setStages((current) => current.filter((stage) => stage.key !== key))

  const validate = (): string | null => {
    if (!form.contract_name.trim()) return '请输入合同名称'
    if (form.contract_name.trim().length > 100) return '合同名称不能超过 100 个字符'
    if (!form.product_no) return '请选择所属产品'
    if (!form.customer_no) return '请选择所属客户'
    if (!form.contract_type) return '请选择合同类型'
    if (!form.sign_date) return '请选择合同签订时间'
    if (form.sign_date > today()) return '合同签订时间不得晚于当前日期'
    if (!form.owner_no) return '请选择责任人'
    if (!(total > 0)) return '合同总金额必须大于 0'
    const purchase = Number(form.purchase_amount || 0)
    if (purchase < 0) return '合同对外采购金额不得小于 0'
    if (purchase > total) return '合同对外采购金额不得大于合同总金额'
    const tax = Number(form.tax_rate)
    if (Number.isNaN(tax) || tax < 0 || tax > 100) return '合同税率取值范围为 0~100'
    if (!stages.length) return '付款条款至少需要 1 条'
    for (let i = 0; i < stages.length; i += 1) {
      if (!stages[i].stage_name.trim()) return `第 ${i + 1} 条付款条款的付款阶段名称不能为空`
      const ratio = Number(stages[i].ratio)
      if (!(ratio > 0) || ratio > 100) return `第 ${i + 1} 条付款比例必须大于 0 且不大于 100`
      if (!stages[i].pay_condition.trim()) return `第 ${i + 1} 条阶段付款条件不能为空`
    }
    if (Math.abs(ratioSum - 100) > 0.001) return `付款条款比例合计必须为 100%，当前为 ${ratioSum.toFixed(2)}%`
    if (Math.abs(amountSum - total) > 0.01) return '付款条款金额合计与合同总金额不一致'
    return null
  }

  const save = async (submit: boolean) => {
    const message = validate()
    if (message) {
      toast(message, 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        contract_no: isEdit ? contractNo : undefined,
        contract_name: form.contract_name.trim(),
        product_no: form.product_no,
        customer_no: form.customer_no,
        dept_no: form.dept_no,
        contract_type: form.contract_type,
        sign_date: form.sign_date,
        owner_no: form.owner_no,
        total_amount: total,
        purchase_amount: Number(form.purchase_amount || 0),
        tax_rate: Number(form.tax_rate),
        remark: form.remark,
        stages: stages.map((stage) => ({
          stage_name: stage.stage_name.trim(),
          ratio: Number(stage.ratio),
          pay_condition: stage.pay_condition.trim(),
          remark: stage.remark,
        })),
        submit,
      }
      const res = await contractApi.save(payload)
      toast(submit ? '已保存并提交审批' : '保存成功')
      navigate(submit ? '/contract/ledger' : `/contract/detail/${res.contract_no}`)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const onOwnerChange = (ownerNo: string) => {
    const person = (options?.persons || []).find((item) => item.code === ownerNo)
    setForm((current) => ({ ...current, owner_no: ownerNo, dept_no: person ? person.dept_no : current.dept_no }))
  }

  if (loading) return <div className="card">加载中…</div>

  return (
    <div className="screen-stack">
      <section className="card">
        <div className="section-header">
          <div>
            <h2>{isEdit ? '修改合同' : '新增合同'}</h2>
            <p>合同编号 {noPreview || '-'} · 保存后生成草稿，提交后进入审批</p>
          </div>
        </div>
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">合同编号</label>
            <div className="field-control"><input value={noPreview} disabled /></div>
          </div>
          <div className="form-item">
            <label className="field-label required">合同名称</label>
            <div className="field-control">
              <input
                value={form.contract_name}
                maxLength={100}
                placeholder="请输入合同名称"
                onChange={(e) => setForm({ ...form, contract_name: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">所属产品</label>
            <div className="field-control">
              <select value={form.product_no} onChange={(e) => setForm({ ...form, product_no: e.target.value })}>
                <option value="">请选择产品</option>
                {(options?.products || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">所属客户</label>
            <div className="field-control">
              <select value={form.customer_no} onChange={(e) => setForm({ ...form, customer_no: e.target.value })}>
                <option value="">请选择客户</option>
                {(options?.customers || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">合同类型</label>
            <div className="field-control">
              <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}>
                <option value="">请选择合同类型</option>
                {(options?.contract_types || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">签订日期</label>
            <div className="field-control">
              <input
                type="date"
                max={today()}
                value={form.sign_date}
                onChange={(e) => setForm({ ...form, sign_date: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">责任人</label>
            <div className="field-control">
              <select value={form.owner_no} onChange={(e) => onOwnerChange(e.target.value)}>
                <option value="">请选择责任人</option>
                {(options?.persons || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">所属部门</label>
            <div className="field-control">
              <select value={form.dept_no} onChange={(e) => setForm({ ...form, dept_no: e.target.value })}>
                <option value="">请选择部门</option>
                {(options?.departments || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">合同总金额</label>
            <div className="field-control">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.total_amount}
                placeholder="0.00"
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">对外采购金额</label>
            <div className="field-control">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.purchase_amount}
                placeholder="0.00"
                onChange={(e) => setForm({ ...form, purchase_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">税率(%)</label>
            <div className="field-control">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-item span-3">
            <label className="field-label">备注</label>
            <div className="field-control">
              <textarea
                rows={2}
                maxLength={200}
                value={form.remark}
                placeholder="最多 200 个字符"
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>付款条款</h2>
            <p>各阶段付款比例合计必须为 100%，阶段金额按合同总金额自动计算</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setStages([...stages, newStage()])}>
            <Plus size={15} />新增阶段
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="number-col">序号</th>
                <th style={{ minWidth: 180 }}>付款阶段名称</th>
                <th className="number-input-col">付款比例(%)</th>
                <th className="money-input-col align-right">阶段金额</th>
                <th style={{ minWidth: 220 }}>阶段付款条件</th>
                <th style={{ minWidth: 140 }}>备注</th>
                <th className="action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage, index) => (
                <tr key={stage.key}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      className="table-input"
                      value={stage.stage_name}
                      maxLength={50}
                      placeholder="如：首付款"
                      onChange={(e) => updateStage(stage.key, { stage_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={stage.ratio}
                      placeholder="0"
                      onChange={(e) => updateStage(stage.key, { ratio: e.target.value })}
                    />
                  </td>
                  <td className="align-right amount-cell">{money(stageAmounts[index])}</td>
                  <td>
                    <input
                      className="table-input"
                      value={stage.pay_condition}
                      maxLength={200}
                      placeholder="如：合同签订后 10 个工作日内支付"
                      onChange={(e) => updateStage(stage.key, { pay_condition: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      value={stage.remark}
                      maxLength={200}
                      onChange={(e) => updateStage(stage.key, { remark: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button delete-row"
                      title="删除该阶段"
                      onClick={() => removeStage(stage.key)}
                      disabled={stages.length <= 1}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="order-summary">
          <span>比例合计：<strong className={Math.abs(ratioSum - 100) > 0.001 ? 'summary-error' : ''}>{ratioSum.toFixed(2)}%</strong></span>
          <span>阶段金额合计：<strong>{money(amountSum)}</strong></span>
          <span>合同总金额：<strong>{money(total)}</strong></span>
        </div>
      </section>

      <div className="form-footer">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}><ArrowLeft size={15} />返回</button>
        <div className="action-row">
          <button className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>
            <Save size={15} />保存草稿
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            <Send size={15} />保存并提交
          </button>
        </div>
      </div>
    </div>
  )
}
