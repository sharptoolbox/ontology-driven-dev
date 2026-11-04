import { useEffect, useState } from 'react'
import { Check, ClipboardCheck, X } from 'lucide-react'
import { contractApi, type ApprovalRow, type ContractDetail } from '../../api/contract'
import { workbenchApi } from '../../api/workbench'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { amount, money, shortDate, shortTime, statusClass, text } from '../../utils/format'

export default function ContractApproval() {
  const [mode, setMode] = useState<'todo' | 'done'>('todo')
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [current, setCurrent] = useState<ApprovalRow | null>(null)
  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const query = { page, size, contract_no: keyword, contract_name: keyword }
      const res = mode === 'todo' ? await contractApi.approvalTodo(query) : await contractApi.approvalDone(query)
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, page, keyword])

  const open = async (row: ApprovalRow) => {
    setCurrent(row)
    setComment('')
    setDetail(null)
    try {
      setDetail(await contractApi.detail(row.contract_no))
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const act = async (action: 'approve' | 'reject') => {
    if (!current) return
    if (action === 'reject' && !comment.trim()) {
      toast('驳回时审批意见必填', 'error')
      return
    }
    setBusy(true)
    try {
      const message =
        action === 'approve'
          ? await workbenchApi.approve(current.task_id, comment)
          : await workbenchApi.reject(current.task_id, comment)
      toast(message || (action === 'approve' ? '审批通过' : '已驳回'))
      setCurrent(null)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen-stack">
      <section className="card" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
          <div>
            <h2>合同审批</h2>
            <p>审批流 APR-001：财务经理审批 → 合同总金额 ≥ 100 万时追加总经理审批</p>
          </div>
          <div className="segmented">
            <button className={mode === 'todo' ? 'active' : ''} onClick={() => { setMode('todo'); setPage(1) }}>
              待我审批
            </button>
            <button className={mode === 'done' ? 'active' : ''} onClick={() => { setMode('done'); setPage(1) }}>
              我已审批
            </button>
          </div>
        </div>
        <div className="toolbar" style={{ padding: '0 20px 12px' }}>
          <input
            style={{ width: 280 }}
            placeholder="按合同编号 / 名称过滤"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          />
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>合同编号</th>
                <th>合同名称</th>
                <th>部门</th>
                <th className="align-right">合同总金额</th>
                <th>提交人</th>
                <th>提交时间</th>
                <th>当前环节</th>
                <th>{mode === 'todo' ? '合同状态' : '审批结果'}</th>
                <th className="action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.task_id}>
                  <td className="mono-cell">{row.contract_no}</td>
                  <td className="strong-cell">{row.contract_name}</td>
                  <td>{text(row.dept_name)}</td>
                  <td className="align-right amount-cell">{amount(row.total_amount)}</td>
                  <td>{text(row.submit_by_name)}</td>
                  <td>{shortTime(row.submit_at)}</td>
                  <td>{row.activity_name}</td>
                  <td>
                    {mode === 'todo' ? (
                      <span className={`badge ${statusClass(row.contract_status)}`}>
                        {row.contract_status_label || row.contract_status}
                      </span>
                    ) : (
                      <span className={`badge ${row.action === 'REJECT' ? 'badge-danger' : 'badge-success'}`}>
                        {row.action_label || '-'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="text-action" onClick={() => open(row)}>
                      {mode === 'todo' ? <><ClipboardCheck size={13} />处理</> : <><Check size={13} />查看</>}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    {mode === 'todo' ? '暂无待审批合同' : '暂无已审批记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px 16px' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </section>

      <Modal
        title={mode === 'todo' ? '审批处理' : '审批详情'}
        open={!!current}
        onClose={() => setCurrent(null)}
        width={880}
        footer={
          mode === 'todo' ? (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => act('reject')}>
                <X size={14} />驳回
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act('approve')}>
                <Check size={14} />通过
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => setCurrent(null)}>关闭</button>
          )
        }
      >
        {current && (
          <div className="approval-body">
            <div className="approval-summary">
              <div><span>合同编号</span><strong>{current.contract_no}</strong></div>
              <div><span>合同名称</span><strong>{current.contract_name}</strong></div>
              <div><span>合同总金额</span><strong>{amount(current.total_amount)}</strong></div>
              <div><span>所属部门</span><strong>{text(current.dept_name)}</strong></div>
              <div><span>提交人</span><strong>{text(current.submit_by_name)}</strong></div>
              <div><span>当前环节</span><strong>{current.activity_name}</strong></div>
            </div>

            {detail && (
              <>
                <div className="form-grid-3 approval-fields">
                  <div className="form-item"><label className="field-label">客户</label><div className="field-control detail-value">{text(detail.customer_name)}</div></div>
                  <div className="form-item"><label className="field-label">产品</label><div className="field-control detail-value">{text(detail.product_name)}</div></div>
                  <div className="form-item"><label className="field-label">合同类型</label><div className="field-control detail-value">{text(detail.contract_type_label)}</div></div>
                  <div className="form-item"><label className="field-label">签订日期</label><div className="field-control detail-value">{shortDate(detail.sign_date)}</div></div>
                  <div className="form-item"><label className="field-label">责任人</label><div className="field-control detail-value">{text(detail.owner_name)}</div></div>
                  <div className="form-item"><label className="field-label">税率</label><div className="field-control detail-value">{detail.tax_rate}%</div></div>
                </div>

                <div className="detail-heading"><h3>付款条款</h3><span>比例合计应等于 100%</span></div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th className="number-col">序号</th>
                        <th>付款阶段</th>
                        <th className="align-right">比例</th>
                        <th className="align-right">阶段金额</th>
                        <th>付款条件</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.stages || []).map((stage) => (
                        <tr key={stage.stage_no}>
                          <td>{stage.stage_no}</td>
                          <td>{stage.stage_name}</td>
                          <td className="align-right">{Number(stage.ratio).toFixed(2)}%</td>
                          <td className="align-right amount-cell">{money(stage.stage_amount)}</td>
                          <td className="wrap-cell">{text(stage.pay_condition)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(detail.approvals || []).length > 0 && (
                  <>
                    <div className="detail-heading"><h3>审批记录</h3><span>历史处理留痕</span></div>
                    <div className="timeline compact">
                      {(detail.approvals || []).map((item, index) => (
                        <div className="timeline-item" key={index}>
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
                    </div>
                  </>
                )}
              </>
            )}

            {mode === 'todo' && (
              <div className="prop-row" style={{ marginTop: 16 }}>
                <label>审批意见（驳回必填，最多 200 字）</label>
                <textarea rows={3} maxLength={200} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
            )}
            {mode === 'done' && current.comment && (
              <div className="prop-row" style={{ marginTop: 16 }}>
                <label>审批意见</label>
                <div className="detail-value">{current.comment}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
