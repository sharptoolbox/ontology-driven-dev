import { http, type PageResult } from './request'
import type { Customer } from './customer'

export interface FlowGraphNode {
  id: string
  type: string
  name: string
  role_ref?: string
  outcomes?: string[]
  result?: string
  behavior_ref?: string
  sub_flow_ref?: string
  branches?: FlowGraphBranch[]
  x?: number
  y?: number
}

export interface FlowGraphBranch {
  target: string
  rule_ref?: string
  condition?: string
  is_default?: boolean
  [key: string]: unknown
}

export interface FlowGraphEdge {
  source: string
  target: string
  approval_outcome?: string
}

export interface FlowGraph {
  nodes: FlowGraphNode[]
  edges: FlowGraphEdge[]
}

export interface FlowDefinition {
  id: number
  code: string
  name: string
  flow_type: string
  trigger_type?: string
  trigger_behavior?: string | null
  description: string | null
  version: number
  status: number
  created_at: string
  node_graph?: FlowGraph | null
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

export interface FlowInstanceDetail extends FlowInstance {
  definition?: FlowDefinition
  tasks?: FlowTask[]
  history?: FlowHistoryItem[]
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
  created_at?: string
  done_at?: string | null
}

export interface FlowHistoryItem {
  id: number
  activity_name: string | null
  operator_name: string | null
  action: string
  comment: string | null
  created_at: string
}

/* ============ 工作台条目(任务行合并客户信息) ============ */

export interface TodoItem extends FlowTask {
  customer_name?: string
  customer_no?: string
  applicant_name?: string
  started_at?: string
}

export interface DoneItem extends FlowTask {
  customer_name?: string
  customer_no?: string
}

export interface RequestedItem extends Customer {
  flow_status?: string
}

/* ============ 流程定义 ============ */

export const flowApi = {
  listDefinitions(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<FlowDefinition>>('/api/flow/definitions', params)
  },
  getDefinition(id: number) {
    return http.get<FlowDefinition>(`/api/flow/definitions/${id}`)
  },
  getGraph(id: number) {
    return http.get<FlowGraph>(`/api/flow/definitions/${id}/graph`)
  },
  createDefinition(data: { code: string; name: string; flow_type: string; description?: string }) {
    return http.post<{ id: number }>('/api/flow/definitions', data)
  },
  updateDefinition(id: number, data: Record<string, unknown>) {
    return http.put(`/api/flow/definitions/${id}`, data)
  },
  publishDefinition(id: number) {
    return http.post(`/api/flow/definitions/${id}/publish`)
  },

  listInstances(params: { page?: number; size?: number; status?: string; keyword?: string }) {
    return http.get<PageResult<FlowInstance>>('/api/flow/instances', params)
  },
  getInstance(id: number) {
    return http.get<FlowInstanceDetail>(`/api/flow/instances/${id}`)
  },
  terminateInstance(id: number) {
    return http.put(`/api/flow/instances/${id}/terminate`)
  },

  listTasks(params: { page?: number; size?: number; status?: string }) {
    return http.get<PageResult<FlowTask>>('/api/flow/tasks', params)
  },
  transferTask(id: number, assigneeId: number) {
    return http.put(`/api/flow/tasks/${id}/transfer`, { assignee_id: assigneeId })
  },
  urgeTask(id: number) {
    return http.put(`/api/flow/tasks/${id}/urge`)
  },
}

/* ============ 工作台 ============ */

export const workbenchApi = {
  todo(params: { page?: number; size?: number }) {
    return http.get<PageResult<TodoItem>>('/api/workbench/todo', params)
  },
  done(params: { page?: number; size?: number }) {
    return http.get<PageResult<DoneItem>>('/api/workbench/done', params)
  },
  requested(params: { page?: number; size?: number }) {
    return http.get<PageResult<RequestedItem>>('/api/workbench/requested', params)
  },
  approve(taskId: number, comment: string) {
    return http.post(`/api/workbench/todo/${taskId}/approve`, { comment })
  },
  reject(taskId: number, comment: string) {
    return http.post(`/api/workbench/todo/${taskId}/reject`, { comment })
  },
  returnTask(taskId: number, comment: string) {
    return http.post(`/api/workbench/todo/${taskId}/return`, { comment })
  },
}
