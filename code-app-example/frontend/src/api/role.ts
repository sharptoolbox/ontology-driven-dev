import { http, type PageResult } from './request'

export interface SysRole {
  id: number
  name: string
  code: string
  parent_id: number
  description: string | null
  status: number
  permissions: number[]
  resources: number[]
}

export interface Permission {
  id: number
  code: string
  name: string
  target_type: string
  target_ref: string
  data_scope: string
  abac_condition: string | null
  status: number
}

export const roleApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<SysRole>>('/roles', params)
  },
  create(data: any) {
    return http.post('/roles', data)
  },
  update(id: number, data: any) {
    return http.put(`/roles/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/roles/${id}`)
  },
  assignPermissions(id: number, permissionIds: number[]) {
    return http.put(`/roles/${id}/permissions`, { permission_ids: permissionIds })
  },
  assignResources(id: number, resourceIds: number[]) {
    return http.put(`/roles/${id}/resources`, { resource_ids: resourceIds })
  },
}
