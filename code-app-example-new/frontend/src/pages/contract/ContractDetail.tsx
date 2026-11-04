import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Send, Undo2 } from 'lucide-react'
import { contractApi, type ContractDetail as Detail } from '../../api/contract'
import { toast } from '../../components/toast'
import { useAuth } from '../../stores/userStore'
import { amount, money, shortDate, shortTime, statusClass, text } from '../../utils/format'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-item">
      <label className="field-label">{label}</label>
      <div className="field-control detail-value">{children}</div>
    </div>
  )
}

export default function ContractDetail() {
  const { contractNo } = useParams()
  const navigate = useNavigate()
  const { user, hasPerm } = useAuth()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!contractNo) return
    setLoading(true)
    try {
      setDetail(await contractApi.detail(contractNo))
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractNo])

  const doSubmit = async () => {
    if (!detail) return
    setBusy(true)
    try {
      const res = await contractApi.submit(detail.contract_no)
      toast(res.level >= 2 ? '已提交审批：需财务经理与总经理审批' : '已提交审批')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const doWithdraw = async () => {
    if (!detail) return
    if (!window.confirm('确认撤回该合同？撤回后合同退回草稿。')) return
    setBusy(true)
    try {
      await contractApi.withdraw(detail.contract_no)
      toast('已撤回，合同退回草稿')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card">加载中…</div>
  if (!detail) return <div className="card">合同不存在或无权查看</div>

  const mine = hasPerm('*') || detail.created_by === user?.id
  const editable = detail.status === 'DRAFT' && mine
  const invoiceUnreceived = Math.max(0, Number(detail.invoiced_amount || 0) - Number(detail.received_amount || 0))

  return (
    <div className="screen-stack">
      <section className="card">
        <div className="detail-title">
          <div>
            <h2>{detail.contract_name}</h2>
            <p>{detail.contract_no} · 创建人 {text(detail.created_by_name)} · 创建时间 {shortTime(detail.created_at)}</p>
          </div>
          <span className={`badge ${statusClass(detail.status)}`}>{detail.status_label || detail.status}</span>
        </div>
        {detail.last_comment && (
          <div className="alert-inline">最近审批意见：{detail.last_comment}</div>
        )}
        <div className="form-grid-3">
          <Field label="所属客户">{text(detail.customer_name)}</Field>
          <Field label="所属产品">{text(detail.product_name)}</Field>
          <Field label="合同类型">{text(detail.contract_type_label)}</Field>
          <Field label="所属部门">{text(detail.dept_name)}</Field>
          <Field label="责任人">{text(detail.owner_name)}</Field>
          <Field label="签订日期">{shortDate(detail.sign_date)}</Field>
          <Field label="合同总金额">{amount(detail.total_amount)}</Field>
          <Field label="对外采购金额">{amount(detail.purchase_amount)}</Field>
          <Field label="税率">{detail.tax_rate}%</Field>
          <Field label="累计开票">{amount(detail.invoiced_amount)}</Field>
          <Field label="累计收款">{amount(detail.received_amount)}</Field>
          <Field label="开票未收款">{amount(invoiceUnreceived)}</Field>
          <Field label="生效时间">{shortTime(detail.effective_time)}</Field>
          <Field label="关闭时间">{shortTime(detail.close_time)}</Field>
          <Field label="提交人 / 时间">
            {detail.submit_by_name ? `${detail.submit_by_name} / ${shortTime(detail.submit_at)}` : '-'}
          </Field>
          <Field label="备注">{text(detail.remark)}</Field>
        </div>
        <div className="form-footer inline">
          <button className="btn btn-secondary" onClick={() => navigate('/contract/ledger')}>
            <ArrowLeft size={15} />返回台账
          </button>
          <div className="action-row">
            {editable && (
              <button className="btn btn-secondary" onClick={() => navigate(`/contract/form/${detail.contract_no}`)}>
                <Pencil size={15} />编辑
              </button>
            )}
            {editable && (
              <button className="btn btn-primary" disabled={busy} onClick={doSubmit}>
                <Send size={15} />提交审批
              </button>
            )}
            {detail.status === 'APPROVING' && mine && (
              <button className="btn btn-secondary" disabled={busy} onClick={doWithdraw}>
                <Undo2 size={15} />撤回
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="detail-heading">
          <h3>付款条款</h3>
          <span>共 {detail.stages?.length || 0} 条</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="number-col">序号</th>
                <th>付款阶段</th>
                <th className="align-right">付款比例</th>
                <th className="align-right">阶段金额</th>
                <th>付款条件</th>
                <th>开票状态</th>
                <th>开票编号</th>
              </tr>
            </thead>
            <tbody>
              {(detail.stages || []).map((stage) => (
                <tr key={stage.stage_no}>
                  <td>{stage.stage_no}</td>
                  <td className="strong-cell">{stage.stage_name}</td>
                  <td className="align-right">{Number(stage.ratio).toFixed(2)}%</td>
                  <td className="align-right amount-cell">{money(stage.stage_amount)}</td>
                  <td className="wrap-cell">{text(stage.pay_condition)}</td>
                  <td>
                    <span className={`badge ${stage.invoice_status === '已开票' ? 'badge-success' : 'badge-neutral'}`}>
                      {stage.invoice_status || '未开票'}
                    </span>
                  </td>
                  <td className="mono-cell">{text(stage.invoice_no)}</td>
                </tr>
              ))}
              {!detail.stages?.length && <tr><td colSpan={7} className="empty-cell">暂无付款条款</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="detail-heading">
          <h3>开票记录</h3>
          <span>累计开票 {amount(detail.invoiced_amount)}</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>开票编号</th>
                <th>付款阶段</th>
                <th className="align-right">开票金额</th>
                <th className="align-right">税率</th>
                <th>开票日期</th>
                <th>收款状态</th>
                <th className="align-right">已收款</th>
                <th className="align-right">未收款</th>
              </tr>
            </thead>
            <tbody>
              {(detail.invoices || []).map((invoice) => (
                <tr key={invoice.invoice_no}>
                  <td className="mono-cell">{invoice.invoice_no}</td>
                  <td>{text(invoice.stage_name)}</td>
                  <td className="align-right amount-cell">{money(invoice.invoice_amount)}</td>
                  <td className="align-right">{invoice.tax_rate}%</td>
                  <td>{shortDate(invoice.invoice_date)}</td>
                  <td>
                    <span className={`badge ${statusClass(invoice.receive_status)}`}>
                      {invoice.receive_status_label || invoice.receive_status}
                    </span>
                  </td>
                  <td className="align-right">{money(invoice.received_amount)}</td>
                  <td className="align-right">{money(invoice.unreceived_amount)}</td>
                </tr>
              ))}
              {!detail.invoices?.length && <tr><td colSpan={8} className="empty-cell">暂无开票记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="detail-heading">
          <h3>收款记录</h3>
          <span>累计收款 {amount(detail.received_amount)}</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>收款编号</th>
                <th>对应开票</th>
                <th className="align-right">收款金额</th>
                <th>收款日期</th>
                <th>收款方式</th>
                <th>登记人</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {(detail.receipts || []).map((receipt) => (
                <tr key={receipt.receive_no}>
                  <td className="mono-cell">{receipt.receive_no}</td>
                  <td className="mono-cell">{receipt.invoice_no}</td>
                  <td className="align-right amount-cell">{money(receipt.receive_amount)}</td>
                  <td>{shortDate(receipt.receive_date)}</td>
                  <td>{text(receipt.receive_method)}</td>
                  <td>{text(receipt.receive_by)}</td>
                  <td className="wrap-cell">{text(receipt.remark)}</td>
                </tr>
              ))}
              {!detail.receipts?.length && <tr><td colSpan={7} className="empty-cell">暂无收款记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="detail-heading">
          <h3>审批记录</h3>
          <span>审批流 APR-001 · 财务经理为必经节点，金额 ≥ 100 万追加总经理</span>
        </div>
        <div className="timeline">
          {(detail.approvals || []).map((item, index) => (
            <div className="timeline-item" key={`${item.activity_name}-${index}`}>
              <span className={`timeline-dot ${item.action === 'REJECT' ? 'rejected' : ''}`} />
              <div className="timeline-body">
                <div className="timeline-head">
                  <strong>{item.activity_name}</strong>
                  <span>{item.action_label}</span>
                  <small>{shortTime(item.created_at)}</small>
                </div>
                <p>{item.operator_name}（{item.role_name}）{item.comment ? `：${item.comment}` : ''}</p>
              </div>
            </div>
          ))}
          {!detail.approvals?.length && <p className="text-secondary">暂无审批记录</p>}
        </div>
      </section>
    </div>
  )
}
