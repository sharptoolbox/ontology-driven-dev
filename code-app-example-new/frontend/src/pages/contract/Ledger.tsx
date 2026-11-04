import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Pencil, Plus, RotateCcw, Search, Send, Trash2, Undo2 } from 'lucide-react'
import { contractApi, type ContractOption, type ContractRow, type ContractQuery } from '../../api/contract'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { useAuth } from '../../stores/userStore'
import { amount, shortDate, statusClass, text, today } from '../../utils/format'

const EMPTY_QUERY: ContractQuery = {
  contract_no: '',
  contract_name: '',
  customer_name: '',
  product_name: '',
  dept_no: '',
  status: '',
  contract_type: '',
  sign_date_from: '',
  sign_date_to: '',
}

const STATUS_OPTIONS = [
  { code: 'DRAFT', label: '草稿' },
  { code: 'APPROVING', label: '审批中' },
  { code: 'EFFECTIVE', label: '已生效' },
  { code: 'CLOSED', label: '已关闭' },
]

export default function ContractLedger() {
  const navigate = useNavigate()
  const { user, hasPerm } = useAuth()
  const [options, setOptions] = useState<ContractOption | null>(null)
  const [query, setQuery] = useState<ContractQuery>({ ...EMPTY_QUERY })
  const [applied, setApplied] = useState<ContractQuery>({ ...EMPTY_QUERY })
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [rows, setRows] = useState<ContractRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const res = await contractApi.list({ ...applied, page: nextPage, size })
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    contractApi.options().then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, applied])

  const search = () => {
    setPage(1)
    setApplied({ ...query })
  }
  const reset = () => {
    setQuery({ ...EMPTY_QUERY })
    setPage(1)
    setApplied({ ...EMPTY_QUERY })
  }

  const canEdit = (row: ContractRow) =>
    row.status === 'DRAFT' && (hasPerm('*') || row.created_by === user?.id)

  const doSubmit = async (row: ContractRow) => {
    setBusy(row.contract_no)
    try {
      const res = await contractApi.submit(row.contract_no)
      toast(res.level >= 2 ? '已提交审批：财务经理审批通过后需总经理审批' : '已提交审批')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const doWithdraw = async (row: ContractRow) => {
    if (!window.confirm(`确认撤回合同「${row.contract_name}」？撤回后合同退回草稿。`)) return
    setBusy(row.contract_no)
    try {
      await contractApi.withdraw(row.contract_no)
      toast('已撤回，合同退回草稿')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const doDelete = async (row: ContractRow) => {
    if (!window.confirm(`确认删除合同「${row.contract_name}」？删除后不可恢复。`)) return
    setBusy(row.contract_no)
    try {
      await contractApi.remove(row.contract_no)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const statusOptions = useMemo(() => STATUS_OPTIONS, [])

  return (
    <div className="screen-stack">
      <section className="card query-card">
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">合同编号</label>
            <div className="field-control">
              <input
                value={query.contract_no || ''}
                placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, contract_no: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同名称</label>
            <div className="field-control">
              <input
                value={query.contract_name || ''}
                placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, contract_name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">客户名称</label>
            <div className="field-control">
              <input
                value={query.customer_name || ''}
                placeholder="支持模糊查询"
                onChange={(e) => setQuery({ ...query, customer_name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">所属产品</label>
            <div className="field-control">
              <select
                value={query.product_no || ''}
                onChange={(e) => setQuery({ ...query, product_no: e.target.value })}
              >
                <option value="">全部产品</option>
                {(options?.products || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">所属部门</label>
            <div className="field-control">
              <select value={query.dept_no || ''} onChange={(e) => setQuery({ ...query, dept_no: e.target.value })}>
                <option value="">全部部门</option>
                {(options?.departments || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同类型</label>
            <div className="field-control">
              <select
                value={query.contract_type || ''}
                onChange={(e) => setQuery({ ...query, contract_type: e.target.value })}
              >
                <option value="">全部类型</option>
                {(options?.contract_types || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">合同状态</label>
            <div className="field-control">
              <select value={query.status || ''} onChange={(e) => setQuery({ ...query, status: e.target.value })}>
                <option value="">全部状态</option>
                {statusOptions.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-item span-2">
            <label className="field-label">签订日期</label>
            <div className="field-control range-control">
              <input
                type="date"
                max={today()}
                value={query.sign_date_from || ''}
                onChange={(e) => setQuery({ ...query, sign_date_from: e.target.value })}
              />
              <span className="range-sep">至</span>
              <input
                type="date"
                max={today()}
                value={query.sign_date_to || ''}
                onChange={(e) => setQuery({ ...query, sign_date_to: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="query-actions">
          <button className="btn btn-secondary" onClick={reset}><RotateCcw size={15} />重置</button>
          <button className="btn btn-primary" onClick={search}><Search size={15} />查询</button>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
          <div>
            <h2>合同台账</h2>
            <p>按数据权限展示合同，草稿仅创建人可编辑</p>
          </div>
          {hasPerm('PERM-001') && (
            <button className="btn btn-primary" onClick={() => navigate('/contract/form')}>
              <Plus size={15} />新增合同
            </button>
          )}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>合同编号</th>
                <th>合同名称</th>
                <th>客户</th>
                <th>部门</th>
                <th>签订日期</th>
                <th className="align-right">合同总金额</th>
                <th>状态</th>
                <th className="action-col-wide">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.contract_no}>
                  <td className="mono-cell">{row.contract_no}</td>
                  <td className="strong-cell cell-ellipsis" title={row.contract_name}>{row.contract_name}</td>
                  <td className="cell-ellipsis">{text(row.customer_name)}</td>
                  <td>{text(row.dept_name)}</td>
                  <td>{shortDate(row.sign_date)}</td>
                  <td className="align-right amount-cell">{amount(row.total_amount)}</td>
                  <td><span className={`badge ${statusClass(row.status)}`}>{row.status_label || row.status}</span></td>
                  <td>
                    <div className="row-actions icon-only">
                      <button className="icon-button" title="查看详情" aria-label="查看详情"
                        onClick={() => navigate(`/contract/detail/${row.contract_no}`)}>
                        <Eye size={15} />
                      </button>
                      {canEdit(row) && (
                        <button className="icon-button" title="修改合同" aria-label="修改合同"
                          onClick={() => navigate(`/contract/form/${row.contract_no}`)}>
                          <Pencil size={15} />
                        </button>
                      )}
                      {canEdit(row) && (
                        <button className="icon-button" title="提交审批" aria-label="提交审批"
                          disabled={busy === row.contract_no} onClick={() => doSubmit(row)}>
                          <Send size={15} />
                        </button>
                      )}
                      {row.status === 'APPROVING' && (hasPerm('*') || row.created_by === user?.id) && (
                        <button className="icon-button" title="撤回合同" aria-label="撤回合同"
                          disabled={busy === row.contract_no} onClick={() => doWithdraw(row)}>
                          <Undo2 size={15} />
                        </button>
                      )}
                      {canEdit(row) && (
                        <button className="icon-button delete-row" title="删除合同" aria-label="删除合同"
                          disabled={busy === row.contract_no} onClick={() => doDelete(row)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="empty-cell">{loading ? '加载中…' : '暂无合同数据'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px 16px' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </section>
    </div>
  )
}
