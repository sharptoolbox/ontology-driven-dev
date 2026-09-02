import { http, type PageResult } from './request'
import type { Permission } from './role'

export const permissionApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<Permission>>('/permissions', params)
  },
  all() {
    return http.get<Permission[]>('/permissions/all')
  },
  create(data: any) {
    return http.post('/permissions', data)
  },
  update(id: number, data: any) {
    return http.put(`/permissions/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/permissions/${id}`)
  },
}
