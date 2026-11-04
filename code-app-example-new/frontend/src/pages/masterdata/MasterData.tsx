import { useEffect, useMemo, useState } from 'react'
import { Database, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import {
  masterdataApi,
  type ContractOptions,
  type DictItem,
  type MasterRecord,
} from '../../api/masterdata'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import { toast } from '../../components/toast'
import { shortDate, text } from '../../utils/format'
import { useAuth } from '../../stores/userStore'

type EntityKey = 'product' | 'customer' | 'department' | 'person'

interface EntityMeta {
  key: EntityKey
  label: string
  codeField: string
  nameField: string
  codeLabel: string
  nameLabel: string
  extraField?: string
  extraLabel?: string
  extraOptions?: 'product_types' | 'customer_types' | 'departments'
}

const ENTITIES: EntityMeta[] = [
  { key: 'product', label: '产品信息', codeField: 'product_no', nameField: 'product_name', codeLabel: '产品编号', nameLabel: '产品名称', extraField: 'product_type', extraLabel: '产品类型', extraOptions: 'product_types' },
  { key: 'customer', label: '客户信息', codeField: 'customer_no', nameField: 'customer_name', codeLabel: '客户编号', nameLabel: '客户名称', extraField: 'customer_type', extraLabel: '客户类型', extraOptions: 'customer_types' },
  { key: 'department', label: '部门信息', codeField: 'dept_no', nameField: 'dept_name', codeLabel: '部门编号', nameLabel: '部门名称' },
  { key: 'person', label: '人员信息', codeField: 'person_no', nameField: 'person_name', codeLabel: '人员编号', nameLabel: '人员名称', extraField: 'dept_no', extraLabel: '所属部门', extraOptions: 'departments' },
]

const ENTITY_PERMISSIONS: Record<EntityKey, string> = {
  product: 'PERM-015',
  customer: 'PERM-016',
  department: 'PERM-017',
  person: 'PERM-018',
}

const DICT_GROUPS = [
  { type: 'CONTRACT_TYPE', label: '合同类型' },
  { type: 'PRODUCT_TYPE', label: '产品类型' },
  { type: 'CUSTOMER_TYPE', label: '客户类型' },
  { type: 'RECEIVE_METHOD', label: '收款方式' },
]

const READONLY_DICTS = [
  { type: 'CONTRACT_STATUS', label: '合同状态' },
  { type: 'RECEIVE_STATUS', label: '开票收款状态' },
]

export default function MasterData() {
  const { hasPerm } = useAuth()
  const [active, setActive] = useState<string>('product')
  const [base, setBase] = useState<ContractOptions | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [rows, setRows] = useState<MasterRecord[]>([])
  const [total, setTotal] = useState(0)
  const [readonly, setReadonly] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MasterRecord | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const visibleEntities = useMemo(
    () => ENTITIES.filter((item) => hasPerm(ENTITY_PERMISSIONS[item.key])),
    [hasPerm],
  )
  const canMaintainDict = hasPerm('PERM-019')
  const entity = useMemo(() => ENTITIES.find((item) => item.key === active), [active])
  const isDict = !entity
  const isReadonlyDict = READONLY_DICTS.some((item) => item.type === active)
  const canMaintain = entity ? hasPerm(ENTITY_PERMISSIONS[entity.key]) : canMaintainDict
  const dictLabel =
    [...DICT_GROUPS, ...READONLY_DICTS].find((item) => item.type === active)?.label || ''

  useEffect(() => {
    masterdataApi.options().then(setBase).catch(() => {})
  }, [])

  const load = async (nextPage = page) => {
    try {
      if (entity) {
        const res = await masterdataApi.list(entity.key, { page: nextPage, size, code: keyword, name: keyword })
        setRows(res.list)
        setTotal(res.total)
        setReadonly(false)
      } else {
        const res = await masterdataApi.dictItems(active, { keyword })
        setRows(res.list as any)
        setTotal(res.total)
        setReadonly(res.readonly)
      }
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  useEffect(() => {
    setKeyword('')
    setPage(1)
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const openCreate = () => {
    setEditing(null)
    setForm({})
    setOpen(true)
  }

  const openEdit = (row: MasterRecord) => {
    setEditing(row)
    if (entity) {
      const next: Record<string, string> = {
        code: String(row[entity.codeField] ?? ''),
        name: String(row[entity.nameField] ?? ''),
      }
      if (entity.extraField) next[entity.extraField] = String(row[entity.extraField] ?? '')
      setForm(next)
    } else {
      setForm({
        dict_code: row.dict_code,
        dict_name: row.dict_name,
        sort_no: String(row.sort_no ?? ''),
      })
    }
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (entity) {
        if (!form.code?.trim()) throw new Error(`${entity.codeLabel}不能为空`)
        if (!form.name?.trim()) throw new Error(`${entity.nameLabel}不能为空`)
        if (entity.extraField && !form[entity.extraField]) throw new Error(`请选择${entity.extraLabel}`)
        if (editing) await masterdataApi.update(entity.key, editing.id, form)
        else await masterdataApi.create(entity.key, form)
      } else {
        if (!form.dict_code?.trim()) throw new Error('字典编码不能为空')
        if (!form.dict_name?.trim()) throw new Error('字典项名称不能为空')
        if (editing) await masterdataApi.updateDictItem(editing.id, form)
        else await masterdataApi.createDictItem(active, form)
      }
      toast(editing ? '修改成功' : '新增成功')
      setOpen(false)
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: MasterRecord) => {
    const label = entity ? String(row[entity.nameField] ?? '') : row.dict_name
    if (!window.confirm(`确认删除「${label}」？`)) return
    try {
      if (entity) await masterdataApi.remove(entity.key, row.id)
      else await masterdataApi.removeDictItem(row.id)
      toast('删除成功')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const toggle = async (row: MasterRecord) => {
    try {
      await masterdataApi.toggleDictItem(row.id)
      toast(row.enabled === '是' ? '已停用' : '已启用')
      load()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const optionList = (source?: string) => {
    if (!source || !base) return [] as { code: string; label: string }[]
    const list = (base as any)[source] as { code: string; label: string }[]
    return list || []
  }

  return (
    <div className="masterdata-layout">
      <aside className="masterdata-nav">
        <div className="nav-caption">基础数据</div>
        {visibleEntities.map((item) => (
          <button key={item.key} className={`nav-item ${active === item.key ? 'active' : ''}`} onClick={() => setActive(item.key)}>
            {item.label}
          </button>
        ))}
        {canMaintainDict && <div className="nav-caption">基础字典</div>}
        {canMaintainDict && DICT_GROUPS.map((item) => (
          <button key={item.type} className={`nav-item ${active === item.type ? 'active' : ''}`} onClick={() => setActive(item.type)}>
            {item.label}
          </button>
        ))}
        {canMaintainDict && READONLY_DICTS.map((item) => (
          <button key={item.type} className={`nav-item ${active === item.type ? 'active' : ''}`} onClick={() => setActive(item.type)}>
            {item.label}
            <span className="nav-tag">只读</span>
          </button>
        ))}
      </aside>

      <section className="card" style={{ padding: 0, margin: 0 }}>
        <div className="section-header" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
          <div>
            <h2>{entity ? entity.label : dictLabel}</h2>
            <p>
              {isReadonlyDict
                ? '系统内置字典，随合同状态机与开票收款状态固定，不支持维护'
                : entity
                  ? `${entity.codeLabel}保存后不可修改，${entity.nameLabel}不允许重复`
                  : '编码与名称均不允许重复，停用后的字典项不可在业务中选择'}
            </p>
          </div>
          {!isReadonlyDict && canMaintain && (
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} />新增</button>
          )}
        </div>
        <div className="toolbar" style={{ padding: '0 20px 12px' }}>
          <div className="keyword-box">
            <Search size={15} />
            <input
              placeholder={entity ? `按${entity.codeLabel}或${entity.nameLabel}查询` : '按编码或名称查询'}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1) } }}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => { setKeyword(''); setPage(1); setTimeout(() => load(1), 0) }}>
            <RotateCcw size={15} />重置
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{entity ? entity.codeLabel : '字典编码'}</th>
                <th>{entity ? entity.nameLabel : '字典名称'}</th>
                {entity?.extraField && <th>{entity.extraLabel}</th>}
                {isDict && <th>排序</th>}
                {isDict && <th>状态</th>}
                <th>更新时间</th>
                {!isReadonlyDict && canMaintain && <th className="action-col-wide">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono-cell">
                    {entity ? text(row[entity.codeField]) : row.dict_code}
                  </td>
                  <td className="strong-cell">
                    {entity ? text(row[entity.nameField]) : row.dict_name}
                  </td>
                  {entity?.extraField && (
                    <td>
                      {text(optionList(entity.extraOptions).find((o) => o.code === row[entity.extraField as string])?.label)}
                    </td>
                  )}
                  {isDict && <td>{text(row.sort_no)}</td>}
                  {isDict && (
                    <td>
                      <span className={`badge ${row.enabled === '是' ? 'badge-success' : 'badge-neutral'}`}>
                        {row.enabled === '是' ? '启用' : '停用'}
                      </span>
                    </td>
                  )}
                  <td>{shortDate(row.updated_at || row.created_at)}</td>
                  {!isReadonlyDict && canMaintain && (
                    <td>
                      <div className="row-actions">
                        <button className="text-action" onClick={() => openEdit(row)}>
                          <Pencil size={13} />编辑
                        </button>
                        {isDict && (
                          <button className="text-action" onClick={() => toggle(row)}>
                            {row.enabled === '是' ? '停用' : '启用'}
                          </button>
                        )}
                        <button className="text-action danger" onClick={() => remove(row)}>
                          <Trash2 size={13} />删除
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} className="empty-cell"><Database size={16} /> 暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px 16px' }}>
          <Pagination page={page} size={size} total={total} onChange={setPage} />
        </div>
      </section>

      <Modal
        title={editing ? '修改' : '新增'}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>保存</button>
          </>
        }
      >
        {entity ? (
          <div className="form-grid-2">
            <div className="form-item span-2">
              <label className="field-label required">{entity.codeLabel}</label>
              <div className="field-control">
                <input
                  value={form.code || ''}
                  maxLength={20}
                  disabled={!!editing}
                  placeholder="1~20 位字母或数字"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
            </div>
            <div className="form-item span-2">
              <label className="field-label required">{entity.nameLabel}</label>
              <div className="field-control">
                <input
                  value={form.name || ''}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            {entity.extraField && (
              <div className="form-item span-2">
                <label className="field-label required">{entity.extraLabel}</label>
                <div className="field-control">
                  <select
                    value={form[entity.extraField] || ''}
                    onChange={(e) => setForm({ ...form, [entity.extraField as string]: e.target.value })}
                  >
                    <option value="">请选择{entity.extraLabel}</option>
                    {optionList(entity.extraOptions).map((item) => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="form-grid-2">
            <div className="form-item span-2">
              <label className="field-label required">字典编码</label>
              <div className="field-control">
                <input
                  value={form.dict_code || ''}
                  maxLength={20}
                  disabled={!!editing}
                  placeholder="1~20 位字母、数字或下划线"
                  onChange={(e) => setForm({ ...form, dict_code: e.target.value })}
                />
              </div>
            </div>
            <div className="form-item span-2">
              <label className="field-label required">字典名称</label>
              <div className="field-control">
                <input
                  value={form.dict_name || ''}
                  maxLength={50}
                  onChange={(e) => setForm({ ...form, dict_name: e.target.value })}
                />
              </div>
            </div>
            <div className="form-item span-2">
              <label className="field-label">排序号</label>
              <div className="field-control">
                <input
                  type="number"
                  value={form.sort_no || ''}
                  onChange={(e) => setForm({ ...form, sort_no: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
