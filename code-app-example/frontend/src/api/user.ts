import { http, type PageResult } from './request'

export interface SysUser {
  id: number
  username: string
  real_name: string | null
  email: string | null
  phone: string | null
  actor_type: string
  department_id: number | null
  status: number
  roles: { id: number; name: string; code: string }[]
  created_at: string
}

export interface RoleOption { id: number; name: string; code: string }

export const userApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<SysUser>>('/users', params)
  },
  roleOptions() {
    return http.get<RoleOption[]>('/users/options')
  },
  create(data: any) {
    return http.post('/users', data)
  },
  update(id: number, data: any) {
    return http.put(`/users/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/users/${id}`)
  },
  assignRoles(id: number, roleIds: number[]) {
    return http.put(`/users/${id}/roles`, { role_ids: roleIds })
  },
  resetPwd(id: number, password: string) {
    return http.put(`/users/${id}/reset-pwd`, { password })
  },
}
