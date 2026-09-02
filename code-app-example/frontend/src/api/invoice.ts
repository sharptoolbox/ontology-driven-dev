import { http, type PageResult } from './request'

export interface InvoiceAllocation {
  stage_id: string
  allocated_amount: number
}

export interface Invoice {
  id: number
  invoice_no: string
  contract_id: number | null
  invoice_amount: number
  invoice_tax_rate: number
  invoice_date: string
  received_flag: number
  received_amount: number
  approval_status: string
  contract_no?: string
  contract_name?: string
  allocations?: InvoiceAllocation[]
}

export const invoiceApi = {
  list(params: any) {
    return http.get<PageResult<Invoice>>('/invoice', params)
  },
  options() {
    return http.get<any[]>('/invoice/options')
  },
  get(id: number) {
    return http.get<Invoice>(`/invoice/${id}`)
  },
  createDraft(data: any) {
    return http.post<Invoice>('/invoice/draft', data)
  },
  updateDraft(id: number, data: any) {
    return http.put<Invoice>(`/invoice/${id}/draft`, data)
  },
  submit(id: number) {
    return http.post<Invoice>(`/invoice/${id}/submit`)
  },
  withdraw(id: number) {
    return http.post<Invoice>(`/invoice/${id}/withdraw`)
  },
  void(id: number) {
    return http.post<Invoice>(`/invoice/${id}/void`)
  },
}
