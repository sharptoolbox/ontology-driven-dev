export function money(value: number | string | null | undefined): string {
  const num = Number(value || 0)
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function amount(value: number | string | null | undefined): string {
  return `¥${money(value)}`
}

export function text(value: any): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export function shortDate(value?: string | null): string {
  if (!value) return '-'
  return value.length > 10 ? value.slice(0, 10) : value
}

export function shortTime(value?: string | null): string {
  if (!value) return '-'
  return value.length > 19 ? value.slice(0, 19) : value
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'badge-neutral',
  APPROVING: 'badge-warning',
  EFFECTIVE: 'badge-success',
  CLOSED: 'badge-info',
  UNRECEIVED: 'badge-danger',
  PARTIAL: 'badge-warning',
  RECEIVED: 'badge-success',
}

export function statusClass(status?: string): string {
  return STATUS_CLASS[status || ''] || 'badge-neutral'
}

export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function monthStart(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
}
