import { http, type PageResult } from './request'
import type { ContractReceipt } from './contract'

export interface ReceiptInvoiceOption {
  invoice_no: string
  invoice_amount: number
  received_amount: number
  unreceived_amount: number
  receive_status: string
  receive_status_label?: string
  invoice_date: string
}

export interface ReceiptContractOption {
  contract_no: string
  contract_name: string
  invoices: ReceiptInvoiceOption[]
}

export const receiptApi = {
  list(params: Record<string, any>) {
    return http.get<PageResult<ContractReceipt>>('/receipt/list', params)
  },
  options() {
    return http.get<ReceiptContractOption[]>('/receipt/options')
  },
  create(payload: Record<string, any>) {
    return http.post<{
      receive_no: string
      contract_closed: boolean
      invoice_status: string
      invoice_status_label: string
    }>('/receipt/create', payload)
  },
}
