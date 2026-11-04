import { http } from './request'

export interface SysResource {
  id: number
  parent_id: number
  name: string
  code: string
  permission_code: string | null
  type: 'DIRECTORY' | 'MENU' | 'BUTTON' | 'API'
  path: string | null
  component: string | null
  icon: string | null
  http_method: string | null
  sort_order: number
  status: number
  children?: SysResource[]
}

export const resourceApi = {
  tree() {
    return http.get<SysResource[]>('/resources/tree')
  },
  list() {
    return http.get<SysResource[]>('/resources')
  },
  create(data: any) {
    return http.post('/resources', data)
  },
  update(id: number, data: any) {
    return http.put(`/resources/${id}`, data)
  },
  remove(id: number) {
    return http.del(`/resources/${id}`)
  },
}
