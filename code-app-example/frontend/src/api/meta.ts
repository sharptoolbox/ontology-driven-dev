import { http } from './request'

export interface DictItem { code: string; label: string }

export interface Rule {
  id: string
  name: string
  description: string | null
  expression: string
  rule_type: string
  input_params: { name: string; type: string; sourceField?: string }[]
}

export interface Dictionaries {
  CONTRACT_TYPE: DictItem[]
  PRODUCT_TYPE: DictItem[]
  CUSTOMER_TYPE: DictItem[]
  RECEIPT_METHOD: DictItem[]
  APPROVAL_NODE: DictItem[]
  APPROVAL_RESULT: DictItem[]
  BIZ_TYPE: DictItem[]
}

export const metaApi = {
  dictionaries() {
    return http.get<Dictionaries>('/meta/dictionaries')
  },
  contractStatus() {
    return http.get<string[]>('/meta/contract-status')
  },
  invoiceStatus() {
    return http.get<string[]>('/meta/invoice-status')
  },
  receiptStatus() {
    return http.get<string[]>('/meta/receipt-status')
  },
  rules() {
    return http.get<Rule[]>('/meta/rules')
  },
}
