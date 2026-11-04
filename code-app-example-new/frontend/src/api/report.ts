import { getToken, http } from './request'

export interface ReportRow {
  seq: number | string
  dept_no: string
  dept_name: string
  sign_amount: number
  invoice_amount: number
  unreceived_amount: number
}

export interface ReportResult {
  list: ReportRow[]
  total_row: ReportRow
  criteria: { start_date: string; end_date: string; depts: string[] }
}

export const reportApi = {
  query(params: Record<string, any>) {
    return http.get<ReportResult>('/report/department', params)
  },
  /** 导出走浏览器下载，需要带 Authorization 头，因此用 fetch 取 blob。 */
  async export(params: Record<string, any>) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    const token = getToken()
    const res = await fetch(`/api/report/department/export${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('导出失败')
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition)
    const filename = match ? decodeURIComponent(match[1]) : '部门合同统计.xlsx'
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}
