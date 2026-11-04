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

export const metaApi = {
  dictionaries() {
    return http.get<Record<string, DictItem[]>>('/meta/dictionaries')
  },
  rules() {
    return http.get<Rule[]>('/meta/rules')
  },
}
