import { http } from './request'

export interface DictItem {
  code: string
  label: string
}

export interface Rule {
  id: string
  name: string
  description: string | null
  expression: string
  rule_type: string
  input_params: { name: string; type: string; sourceField?: string }[]
}

export const metaApi = {
  dictionaries() {
    return http.get<{ CUSTOMER_TYPE: DictItem[]; CUSTOMER_LEVEL: DictItem[] }>('/api/meta/dictionaries')
  },
  customerStatus() {
    return http.get<string[]>('/api/meta/customer-status')
  },
  rules() {
    return http.get<Rule[]>('/api/meta/rules')
  },
}
