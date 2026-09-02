import { http, type PageResult } from './request'

export interface ContractStage {
  id?: number
  stage_id: string
  stage_name: string
  pay_ratio: number
  stage_amount?: number
  invoice_status?: string
}

export interface Contract {
  id: number
  contract_no: string
  contract_name: string
  product_id: number | null
  customer_id: number | null
  department_id: number | null
  contract_type: string
  sign_date: string
  owner_id: number | null
  total_amount: number
  purchase_amount: number
  tax_rate: number
  status: string
  product_name?: string
  customer_name?: string
  department_name?: string
  owner_name?: string
  stages?: ContractStage[]
  invoices?: any[]
  receipts?: any[]
  approval_records?: any[]
}

export const contractApi = {
  list(params: any) {
    return http.get<PageResult<Contract>>('/contract', params)
  },
  options() {
    return http.get<any[]>('/contract/options')
  },
  get(id: number) {
    return http.get<Contract>(`/contract/${id}`)
  },
  createDraft(data: any) {
    return http.post<Contract>('/contract/draft', data)
  },
  updateDraft(id: number, data: any) {
    return http.put<Contract>(`/contract/${id}/draft`, data)
  },
  submit(id: number) {
    return http.post<Contract>(`/contract/${id}/submit`)
  },
  withdraw(id: number) {
    return http.post<Contract>(`/contract/${id}/withdraw`)
  },
  void(id: number) {
    return http.post<Contract>(`/contract/${id}/void`)
  },
  archive(id: number) {
    return http.post<Contract>(`/contract/${id}/archive`)
  },
}
