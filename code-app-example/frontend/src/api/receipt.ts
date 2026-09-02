import { http, type PageResult } from './request'

export interface Receipt {
  id: number
  receipt_no: string
  contract_id: number | null
  invoice_id: number | null
  receipt_amount: number
  receipt_time: string
  receipt_method: string
  status: string
  remark: string
  contract_no?: string
  contract_name?: string
  invoice_no?: string
}

export const receiptApi = {
  list(params: any) {
    return http.get<PageResult<Receipt>>('/receipt', params)
  },
  get(id: number) {
    return http.get<Receipt>(`/receipt/${id}`)
  },
  record(data: any) {
    return http.post<Receipt>('/receipt', data)
  },
  reverse(id: number) {
    return http.post<Receipt>(`/receipt/${id}/reverse`)
  },
}
