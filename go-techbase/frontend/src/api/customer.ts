import { http, type PageResult } from './request'

export interface Customer {
  id: number
  customer_no: string
  customer_name: string
  customer_type: string
  industry: string | null
  contact_person: string | null
  contact_phone: string | null
  customer_level: string
  address: string | null
  remark: string | null
  status: string
  applicant_id: number | null
  applicant_name: string | null
  instance_id: number | null
  created_at: string
  flow_status?: string
}

export type CustomerDraftBody = Partial<Omit<Customer, 'id' | 'customer_no' | 'status' | 'applicant_id' | 'applicant_name' | 'instance_id' | 'created_at'>>

export const customerApi = {
  list(params: { page?: number; size?: number; customer_no?: string; customer_name?: string; status?: string }) {
    return http.get<PageResult<Customer>>('/api/customer', params)
  },
  get(id: number) {
    return http.get<Customer>(`/api/customer/${id}`)
  },
  createDraft(data: CustomerDraftBody) {
    return http.post<Customer>('/api/customer/draft', data)
  },
  updateDraft(id: number, data: CustomerDraftBody) {
    return http.put<Customer>(`/api/customer/${id}/draft`, data)
  },
  submit(id: number) {
    return http.post<Customer>(`/api/customer/${id}/submit`)
  },
  withdraw(id: number) {
    return http.post<Customer>(`/api/customer/${id}/withdraw`)
  },
}
