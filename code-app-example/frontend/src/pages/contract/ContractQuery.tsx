import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, RotateCcw, Search } from 'lucide-react'
import { contractApi, type Contract } from '../../api/contract'
import { metaApi, type DictItem } from '../../api/meta'
import Pagination from '../../components/Pagination'
import { Badge } from '../../utils/status'

export default function ContractQuery() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<any>({ contract_no: '', contract_name: '', contract_type: '', status: '' })
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [data, setData] = useState<Contract[]>([])
  const [total, setTotal] = useState(0)
  const [contractTypes, setContractTypes] = useState<DictItem[]>([])
  const [statuses, setStatuses] = useState<string[]>([])

  useEffect(() => {
    metaApi.dictionaries().then((d) => setContractTypes(d.CONTRACT_TYPE))
    metaApi.contractStatus().then(setStatuses)
  }, [])

  const load = async () => {
    const res = await contractApi.list({ page, size, ...filters })
    setData(res.list)
    setTotal(res.total)
  }

  useEffect(() => { load() }, [page]) // eslint-disable-line

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="form-grid-3">
          <div className="form-item">
            <label className="field-label">合同编号</label>
            <div className="field-control"><input value={filters.contract_no} onChange={(e) => setFilters({ ...filters, contract_no: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">合同名称</label>
            <div className="field-control"><input value={filters.contract_name} onChange={(e) => setFilters({ ...filters, contract_name: e.target.value })} /></div>
          </div>
          <div className="form-item">
            <label className="field-label">合同类型</label>
            <div className="field-control">
              <select value={filters.contract_type} onChange={(e) => setFilters({ ...filters, contract_type: e.target.value })}>
                <option value="">全部</option>
                {contractTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-item">
            <label className="field-label">管理状态</label>
            <div className="field-control">
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">全部</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setPage(1); load() }}><Search size={14} /> 查询</button>
          <button className="btn btn-secondary" onClick={() => { setFilters({ contract_no: '', contract_name: '', contract_type: '', status: '' }); setPage(1) }}><RotateCcw size={14} /> 重置</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--divider-color)' }}>
          <h3 style={{ fontWeight: 700 }}>查询结果</h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>合同编号</th><th>合同名称</th><th>产品</th><th>客户</th><th>部门</th><th>责任人</th><th>总金额</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{c.contract_no}</td>
                  <td>{c.contract_name}</td>
                  <td>{c.product_name || '-'}</td>
                  <td>{c.customer_name || '-'}</td>
                  <td>{c.department_name || '-'}</td>
                  <td>{c.owner_name || '-'}</td>
                  <td>{c.total_amount}</td>
                  <td><Badge status={c.status} /></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/contract/maintain?id=${c.id}`)}><Eye size={14} /> 查看</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
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
