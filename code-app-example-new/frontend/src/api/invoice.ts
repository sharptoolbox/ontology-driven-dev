import { http, type PageResult } from './request'
import type { ContractInvoice } from './contract'

export interface InvoiceStageOption {
  stage_no: string
  stage_name: string
  stage_amount: number
  ratio: number
}

export interface InvoiceContractOption {
  contract_no: string
  contract_name: string
  tax_rate: number
  effective_time?: string
  stages: InvoiceStageOption[]
}

export const invoiceApi = {
  list(params: Record<string, any>) {
    return http.get<PageResult<ContractInvoice>>('/invoice/list', params)
  },
  options() {
    return http.get<InvoiceContractOption[]>('/invoice/options')
  },
  create(payload: Record<string, any>) {
    return http.post<{ invoice_no: string; invoice_amount: number }>('/invoice/create', payload)
  },
}
