import { http, type PageResult } from './request'

/* ============ 用户 ============ */

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

export interface UserSaveBody {
  username?: string
  password?: string
  real_name?: string
  email?: string
  phone?: string
  actor_type?: string
  department_id?: number | null
  status?: number
  role_ids?: number[]
}

export const userApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<SysUser>>('/api/users', params)
  },
  create(data: UserSaveBody) {
    return http.post('/api/users', data)
  },
  update(id: number, data: UserSaveBody) {
    return http.put(`/api/users/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/api/users/${id}`)
  },
  assignRoles(id: number, roleIds: number[]) {
    return http.put(`/api/users/${id}/roles`, { role_ids: roleIds })
  },
  resetPwd(id: number, newPassword: string) {
    return http.put(`/api/users/${id}/reset-pwd`, { new_password: newPassword })
  },
}

/* ============ 角色 ============ */

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

export interface RoleSaveBody {
  name?: string
  code?: string
  parent_id?: number
  description?: string
  status?: number
  permission_ids?: number[]
  resource_ids?: number[]
}

export const roleApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<SysRole>>('/api/roles', params)
  },
  create(data: RoleSaveBody) {
    return http.post('/api/roles', data)
  },
  update(id: number, data: RoleSaveBody) {
    return http.put(`/api/roles/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/api/roles/${id}`)
  },
  assignPermissions(id: number, permissionIds: number[]) {
    return http.put(`/api/roles/${id}/permissions`, { permission_ids: permissionIds })
  },
  assignResources(id: number, resourceIds: number[]) {
    return http.put(`/api/roles/${id}/resources`, { resource_ids: resourceIds })
  },
}

/* ============ 权限 ============ */

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

export interface PermissionSaveBody {
  code?: string
  name?: string
  target_type?: string
  target_ref?: string
  data_scope?: string
  abac_condition?: string
  status?: number
}

export const permissionApi = {
  list(params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<Permission>>('/api/permissions', params)
  },
  all() {
    return http.get<Permission[]>('/api/permissions/all')
  },
  create(data: PermissionSaveBody) {
    return http.post('/api/permissions', data)
  },
  update(id: number, data: PermissionSaveBody) {
    return http.put(`/api/permissions/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/api/permissions/${id}`)
  },
}

/* ============ 资源 ============ */

export type ResourceType = 'DIRECTORY' | 'MENU' | 'BUTTON' | 'API'

export interface SysResource {
  id: number
  parent_id: number
  name: string
  code: string
  permission_code: string | null
  type: ResourceType
  path: string | null
  component: string | null
  icon: string | null
  http_method: string | null
  sort_order: number
  status: number
  children?: SysResource[]
}

export interface ResourceSaveBody {
  parent_id?: number
  name?: string
  code?: string
  permission_code?: string
  type?: ResourceType
  path?: string
  component?: string
  icon?: string
  http_method?: string
  sort_order?: number
  status?: number
}

export const resourceApi = {
  tree() {
    return http.get<SysResource[]>('/api/resources/tree')
  },
  list() {
    return http.get<SysResource[]>('/api/resources')
  },
  create(data: ResourceSaveBody) {
    return http.post('/api/resources', data)
  },
  update(id: number, data: ResourceSaveBody) {
    return http.put(`/api/resources/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/api/resources/${id}`)
  },
}
