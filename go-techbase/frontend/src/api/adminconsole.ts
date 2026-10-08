/** 管理控制台补齐 API（日志审计/在线用户/公告/错误码/系统监控） */
import { http } from './request'

export interface Page<T = Record<string, unknown>> {
  list: T[]
  total: number
  page: number
  size: number
}

export interface AuditLogRow {
  id: number
  username: string
  action: string
  detail: string
  created_at: string
}

export interface OnlineUserRow {
  username: string
  last_login: string
  login_times: number
}

export interface NoticeRow {
  id: number
  title: string
  content: string
  status: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface NamedCode {
  code: string
  desc: string
}

export const adminConsoleApi = {
  operationLogs: (page = 1, size = 20) =>
    http.get<Page<AuditLogRow>>(`/api/admin/logs/operation`, { params: { page, size } }),
  loginLogs: (page = 1, size = 20) =>
    http.get<Page<AuditLogRow>>(`/api/admin/logs/login`, { params: { page, size } }),
  auditLogs: (page = 1, size = 20) =>
    http.get<Page<AuditLogRow>>(`/api/admin/logs/audit`, { params: { page, size } }),
  onlineUsers: () => http.get<OnlineUserRow[]>('/api/admin/online-users'),
  noticeList: (page = 1, size = 20) => http.get<Page<NoticeRow>>('/api/admin/notice', { params: { page, size } }),
  noticeSave: (id: number, body: { title: string; content: string; status: number }) =>
    id === 0
      ? http.post<{ affected: number; id: number }>('/api/admin/notice', body)
      : http.put<{ affected: number; id: number }>(`/api/admin/notice/${id}`, body),
  noticeDelete: (id: number) => http.del<{ affected: number }>(`/api/admin/notice/${id}`),
  errCodes: () => http.get<NamedCode[]>('/api/admin/errcodes'),
  systemStats: () => http.get<Record<string, unknown>>('/api/admin/system-stats'),
}
