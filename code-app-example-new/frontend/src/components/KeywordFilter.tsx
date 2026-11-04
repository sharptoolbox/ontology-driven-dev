import { Search, X } from 'lucide-react'

export function matchesKeyword(value: unknown, keyword: string): boolean {
  const query = keyword.trim().toLocaleLowerCase()
  if (!query) return true
  return JSON.stringify(value).toLocaleLowerCase().includes(query)
}

export default function KeywordFilter({ value, onChange, placeholder = '输入关键字过滤' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="keyword-filter">
    <Search size={15}/>
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/>
    {value && <button type="button" title="清空关键字" onClick={() => onChange('')}><X size={14}/></button>}
  </div>
}
