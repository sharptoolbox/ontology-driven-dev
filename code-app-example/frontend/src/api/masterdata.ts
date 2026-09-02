import { http, type PageResult } from './request'

export type MasterKind = 'product' | 'customer' | 'department' | 'employee'

export interface MasterOption {
  id: number
  no: string
  name: string
  department_id?: number
}

export const masterDataApi = {
  list(kind: MasterKind, params: { page?: number; size?: number; keyword?: string }) {
    return http.get<PageResult<any>>(`/masterdata/${kind}`, params)
  },
  options(kind: MasterKind) {
    return http.get<MasterOption[]>(`/masterdata/${kind}/options`)
  },
  create(kind: MasterKind, data: any) {
    return http.post(`/masterdata/${kind}`, data)
  },
  update(kind: MasterKind, id: number, data: any) {
    return http.put(`/masterdata/${kind}/${id}`, data)
  },
  remove(kind: MasterKind, id: number) {
    return http.del(`/masterdata/${kind}/${id}`)
  },
}
