import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  size: number
  total: number
  onChange: (page: number) => void
}

export default function Pagination({ page, size, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / size))
  const pages: number[] = []
  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div className="pagination">
      <span className="page-info">共 {total} 条 / {totalPages} 页</span>
      <button className="btn btn-secondary page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`btn page-btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button className="btn btn-secondary page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
