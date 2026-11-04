import { http, requestMessage, type PageResult } from './request'
import type { FlowTask } from './flow'

export interface TodoItem extends FlowTask {
  started_at?: string
}

export interface DoneItem extends FlowTask {}

export const workbenchApi = {
  todo(params: { page?: number; size?: number }) {
    return http.get<PageResult<TodoItem>>('/workbench/todo', params)
  },
  done(params: { page?: number; size?: number }) {
    return http.get<PageResult<DoneItem>>('/workbench/done', params)
  },
  approve(taskId: number, comment: string) {
    return requestMessage(`/workbench/todo/${taskId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    })
  },
  reject(taskId: number, comment: string) {
    return requestMessage(`/workbench/todo/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    })
  },
  returnTask(taskId: number, comment: string) {
    return requestMessage(`/workbench/todo/${taskId}/return`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    })
  },
}
