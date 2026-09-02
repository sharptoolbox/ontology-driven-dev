import { http, type PageResult } from './request'

export interface TodoItem {
  id: number
  instance_id: number
  activity_id: string
  activity_name: string
  role_ref: string | null
  assignee_id: number | null
  assignee_name: string | null
  status: string
  action: string | null
  comment: string | null
  biz_type: string
  biz_id: number
  biz_no: string
  biz_name: string
  started_at: string
}

export interface DoneItem extends TodoItem {
  done_at?: string
}

export interface RequestedItem {
  id: number
  def_id: number
  business_key: string
  status: string
  started_at: string
  biz_type: string
  biz_id: number
  biz_no: string
  biz_name: string
  biz_status: string | null
}

export const workbenchApi = {
  todo(params: { page?: number; size?: number }) {
    return http.get<PageResult<TodoItem>>('/workbench/todo', params)
  },
  done(params: { page?: number; size?: number }) {
    return http.get<PageResult<DoneItem>>('/workbench/done', params)
  },
  requested(params: { page?: number; size?: number }) {
    return http.get<PageResult<RequestedItem>>('/workbench/requested', params)
  },
  approve(taskId: number, comment: string) {
    return http.post(`/workbench/todo/${taskId}/approve`, { comment })
  },
  reject(taskId: number, comment: string) {
    return http.post(`/workbench/todo/${taskId}/reject`, { comment })
  },
  returnTask(taskId: number, comment: string) {
    return http.post(`/workbench/todo/${taskId}/return`, { comment })
  },
}
