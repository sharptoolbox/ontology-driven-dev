import { http, type PageResult } from './request'
import type { LookupOption } from './masterdata'

export interface ContractStage {
  id?: number
  stage_no?: string
  stage_name: string
  ratio: number
  stage_amount?: number
  pay_condition: string
  invoice_status?: string
  invoice_no?: string | null
  remark?: string
}

export interface ContractInvoice {
  id: number
  invoice_no: string
  contract_no: string
  contract_name?: string
  dept_no?: string
  dept_name?: string
  stage_no: string
  stage_name?: string
  invoice_amount: number
  tax_rate: number
  invoice_date: string
  receive_status: string
  receive_status_label?: string
  received_amount: number
  unreceived_amount: number
  invoice_by?: string
  remark?: string
}

export interface ContractReceipt {
  id: number
  receive_no: string
  contract_no: string
  contract_name?: string
  dept_no?: string
  dept_name?: string
  invoice_no: string
  receive_amount: number
  receive_date: string
  receive_method?: string
  receive_by?: string
  remark?: string
}

export interface ContractApproval {
  activity_name: string
  role_name: string
  operator_name: string
  action: string
  action_label: string
  comment: string
  created_at: string
}

export interface ContractRow {
  id: number
  contract_no: string
  contract_name: string
  product_no: string
  product_name?: string
  customer_no: string
  customer_name?: string
  dept_no: string
  dept_name?: string
  contract_type: string
  contract_type_label?: string
  sign_date: string
  owner_no: string
  owner_name?: string
  total_amount: number
  purchase_amount: number
  tax_rate: number
  status: string
  status_label?: string
  effective_time?: string
  close_time?: string
  invoiced_amount: number
  received_amount: number
  instance_id?: number | null
  submit_by_name?: string
  submit_at?: string
  last_comment?: string
  remark?: string
  created_by: number
  created_by_name?: string
  created_at?: string
}

export interface ContractDetail extends ContractRow {
  stages: ContractStage[]
  invoices: ContractInvoice[]
  receipts: ContractReceipt[]
  approvals: ContractApproval[]
}

export interface ContractOption {
  products: LookupOption[]
  customers: LookupOption[]
  departments: LookupOption[]
  persons: LookupOption[]
  contract_types: { code: string; label: string }[]
  product_types: { code: string; label: string }[]
  customer_types: { code: string; label: string }[]
  receive_methods: { code: string; label: string }[]
}

export interface ApprovalRow {
  task_id: number
  activity_name: string
  task_status: string
  action?: string
  action_label?: string
  comment?: string
  done_at?: string
  contract_no: string
  contract_name: string
  total_amount: number
  submit_by_name?: string
  submit_at?: string
  contract_status: string
  contract_status_label?: string
  dept_name?: string
}

export interface ContractQuery {
  page?: number
  size?: number
  contract_no?: string
  contract_name?: string
  customer_name?: string
  product_name?: string
  product_no?: string
  product_type?: string
  dept_no?: string
  status?: string
  contract_type?: string
  sign_date_from?: string
  sign_date_to?: string
}

export const contractApi = {
  prefill() {
    return http.get<{ contract_no: string }>('/contract/prefill')
  },
  options() {
    return http.get<ContractOption>('/contract/options')
  },
  list(params: ContractQuery) {
    return http.get<PageResult<ContractRow>>('/contract/list', params)
  },
  detail(contractNo: string) {
    return http.get<ContractDetail>(`/contract/detail/${contractNo}`)
  },
  save(payload: any) {
    return http.post<{ contract_no: string }>('/contract/save', payload)
  },
  submit(contractNo: string) {
    return http.post<{ contract_no: string; level: number }>(`/contract/${contractNo}/submit`)
  },
  withdraw(contractNo: string) {
    return http.post(`/contract/${contractNo}/withdraw`)
  },
  remove(contractNo: string) {
    return http.del(`/contract/${contractNo}`)
  },
  approvalTodo(params: Record<string, any>) {
    return http.get<PageResult<ApprovalRow>>('/contract/approval/todo', params)
  },
  approvalDone(params: Record<string, any>) {
    return http.get<PageResult<ApprovalRow>>('/contract/approval/done', params)
  },
}
