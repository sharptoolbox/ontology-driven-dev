import { http, type PageResult } from './request'

export interface FlowDefinition {
  id: number
  code: string
  name: string
  flow_type: string
  trigger_type: string
  trigger_behavior: string | null
  description: string | null
  version: number
  status: number
  created_at: string
  node_graph?: any
}

export interface FlowInstance {
  id: number
  def_id: number
  business_key: string
  creator_id: number
  status: string
  started_at: string
  ended_at: string | null
  def_name?: string
  def_code?: string
}

export interface FlowTask {
  id: number
  instance_id: number
  activity_id: string
  activity_type: string
  activity_name: string
  role_ref: string | null
  assignee_id: number | null
  assignee_name: string | null
  status: string
  action: string | null
  comment: string | null
  business_key?: string
}

export const flowApi = {
  listDefinitions(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<FlowDefinition>>('/flow/definitions', params)
  },
  getDefinition(id: number) {
    return http.get<FlowDefinition>(`/flow/definitions/${id}`)
  },
  getGraph(id: number) {
    return http.get<any>(`/flow/definitions/${id}/graph`)
  },
  createDefinition(data: any) {
    return http.post('/flow/definitions', data)
  },
  updateDefinition(id: number, data: any) {
    return http.put(`/flow/definitions/${id}`, data)
  },
  publishDefinition(id: number) {
    return http.post(`/flow/definitions/${id}/publish`)
  },
  listInstances(params: { page?: number; size?: number; status?: string; keyword?: string }) {
    return http.get<PageResult<FlowInstance>>('/flow/instances', params)
  },
  getInstance(id: number) {
    return http.get<any>(`/flow/instances/${id}`)
  },
  terminateInstance(id: number) {
    return http.put(`/flow/instances/${id}/terminate`)
  },
  listTasks(params: { page?: number; size?: number; status?: string }) {
    return http.get<PageResult<FlowTask>>('/flow/tasks', params)
  },
  transferTask(id: number, assigneeId: number) {
    return http.put(`/flow/tasks/${id}/transfer`, { assignee_id: assigneeId })
  },
  urgeTask(id: number) {
    return http.put(`/flow/tasks/${id}/urge`)
  },
}
