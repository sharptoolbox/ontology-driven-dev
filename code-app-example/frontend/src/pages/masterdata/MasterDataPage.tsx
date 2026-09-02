import { useCallback, useEffect, useState } from 'react'
import { Edit2, Plus, Save, Trash2 } from 'lucide-react'
import { masterDataApi, type MasterKind } from '../../api/masterdata'
import { metaApi, type DictItem } from '../../api/meta'
import Pagination from '../../components/Pagination'
import PopupSelect from '../../components/PopupSelect'
import Modal from '../../components/Modal'
import { toast } from '../../components/toast'

const KIND_CONF: Record<MasterKind, { title: string; entity: string; no: string; name: string }> = {
  product: { title: '产品信息维护', entity: '产品', no: 'product_no', name: 'product_name' },
  customer: { title: '客户信息维护', entity: '客户', no: 'customer_no', name: 'customer_name' },
  department: { title: '部门信息维护', entity: '部门', no: 'department_no', name: 'department_name' },
  employee: { title: '人员信息维护', entity: '人员', no: 'employee_no', name: 'employee_name' },
}

const TYPE_LABEL: Record<string, string> = { product: '产品类型', customer: '客户类型' }

export default function MasterDataPage({ kind }: { kind: MasterKind }) {
  const conf = KIND_CONF[kind]
  const [form, setForm] = useState<any>({})
  const [editing, setEditing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [dicts, setDicts] = useState<DictItem[]>([])
  const [deptDisplay, setDeptDisplay] = useState('')

  const load = useCallback(async () => {
    const res = await masterDataApi.list(kind, { page, size, keyword })
    setData(res.list)
    setTotal(res.total)
  }, [kind, page, size, keyword])

  useEffect(() => {
    if (kind === 'product' || kind === 'customer') {
      metaApi.dictionaries().then((d) => setDicts(kind === 'product' ? d.PRODUCT_TYPE : d.CUSTOMER_TYPE))
    }
  }, [kind])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setForm({})
    setEditing(false)
    setDeptDisplay('')
    setShowForm(true)
  }

  const openEdit = (row: any) => {
    setForm({ ...row })
    setEditing(true)
    setDeptDisplay(row.department_name || '')
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      if (editing) await masterDataApi.update(kind, form.id, form)
      else await masterDataApi.create(kind, form)
      toast('保存成功')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (row: any) => {
    if (!window.confirm('确认删除该记录？')) return
    try {
      await masterDataApi.remove(kind, row.id)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const deptOptions = useCallback(() => masterDataApi.options('department'), [])

  return (
    <div>
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex-between">
          <div className="form-item" style={{ width: 320 }}>
            <label className="field-label">关键词</label>
            <div className="field-control">
              <input placeholder="编号 / 名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
          </div>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => { setPage(1); load() }}>查询</button>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> 新增</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>编号</th>
                <th>名称</th>
                {kind === 'product' && <th>产品类型</th>}
                {kind === 'customer' && <th>客户类型</th>}
                {kind === 'employee' && <th>所属部门</th>}
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td>{row[conf.no]}</td>
                  <td>{row[conf.name]}</td>
                  {kind === 'product' && <td>{dicts.find((d) => d.code === row.product_type)?.label || row.product_type}</td>}
                  {kind === 'customer' && <td>{dicts.find((d) => d.code === row.customer_type)?.label || row.customer_type}</td>}
                  {kind === 'employee' && <td>{row.department_name || '-'}</td>}
                  <td>{row.status}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}><Edit2 size={14} /> 编辑</button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(row)}><Trash2 size={14} /> 删除</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </div>

      <Modal
        title={editing ? `编辑${conf.entity}` : `新增${conf.entity}`}
        open={showForm}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={14} /> 保存</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-item">
            <label className="field-label">编号</label>
            <div className="field-control">
              <input value={form[conf.no] || '（保存后自动生成）'} readOnly disabled />
            </div>
          </div>
          <div className="form-item">
            <label className="field-label required">{conf.entity}名称</label>
            <div className="field-control">
              <input value={form[conf.name] || ''} onChange={(e) => setForm({ ...form, [conf.name]: e.target.value })} />
            </div>
          </div>
          {(kind === 'product' || kind === 'customer') && (
            <div className="form-item">
              <label className="field-label">{TYPE_LABEL[kind]}</label>
              <div className="field-control">
                <select value={form[kind + '_type'] || ''} onChange={(e) => setForm({ ...form, [kind + '_type']: e.target.value })}>
                  <option value="">请选择</option>
                  {dicts.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              </div>
            </div>
          )}
          {kind === 'employee' && (
            <div className="form-item">
              <label className="field-label">所属部门</label>
              <div className="field-control">
                <PopupSelect
                  value={form.department_id || null}
                  display={deptDisplay}
                  title="选择部门"
                  fetchOptions={deptOptions}
                  onSelect={(o) => { setForm({ ...form, department_id: o.id }); setDeptDisplay(o.name || o.no || '') }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
