import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Modal from './Modal'

export interface PopupColumn {
  key: string
  label: string
}

interface PopupSelectProps {
  value: number | null
  display: string
  disabled?: boolean
  title?: string
  columns?: PopupColumn[]
  fetchOptions: () => Promise<any[]>
  onSelect: (option: any) => void
}

const DEFAULT_COLUMNS: PopupColumn[] = [
  { key: 'no', label: '编号' },
  { key: 'name', label: '名称' },
]

export default function PopupSelect({ value, display, disabled, title = '选择', columns, fetchOptions, onSelect }: PopupSelectProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<any[]>([])
  const [keyword, setKeyword] = useState('')

  const cols = columns || DEFAULT_COLUMNS

  useEffect(() => {
    if (open) {
      fetchOptions().then(setOptions).catch(() => setOptions([]))
    }
  }, [open, fetchOptions])

  const filtered = options.filter((o) => !keyword || cols.some((c) => String(o[c.key] ?? '').includes(keyword)))

  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      <input value={display} readOnly placeholder="请选择" style={{ flex: 1 }} disabled={disabled} />
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '6px 12px' }}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Search size={14} />
      </button>
      <Modal title={title} open={open} onClose={() => setOpen(false)} width={Math.max(360, cols.length * 150 + 110)}>
        <div className="form-item" style={{ marginBottom: 12 }}>
          <label className="field-label">关键词</label>
          <div className="field-control">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="输入关键词筛选" />
          </div>
        </div>
        <div className="table-container" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  {cols.map((c) => <td key={c.key}>{o[c.key] ?? '-'}</td>)}
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => { onSelect(o); setOpen(false) }}>
                      选择
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', color: '#94a3b8' }}>无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
