import { http, type PageResult } from './request'

export interface OptionItem {
  code: string
  label: string
}

export interface LookupOption {
  code: string
  label: string
  dept_no?: string
  product_type?: string
  customer_type?: string
}

export interface ContractOptions {
  products: LookupOption[]
  customers: LookupOption[]
  departments: LookupOption[]
  persons: LookupOption[]
  contract_types: OptionItem[]
  product_types: OptionItem[]
  customer_types: OptionItem[]
  receive_methods: OptionItem[]
}

export interface DictTypeMeta {
  type: string
  name: string
  editable: boolean
  items?: { dict_code: string; dict_name: string }[]
}

export interface DictItem {
  id: number
  dict_type: string
  dict_code: string
  dict_name: string
  sort_no: number
  enabled: string
  readonly?: boolean
}

export interface MasterRecord {
  id: number
  [key: string]: any
}

export const masterdataApi = {
  options() {
    return http.get<ContractOptions>('/masterdata/options')
  },
  dictTypes() {
    return http.get<{ maintainable: DictTypeMeta[]; readonly: DictTypeMeta[] }>('/masterdata/dict-types')
  },
  dictItems(dictType: string, params: Record<string, any> = {}) {
    return http.get<{ list: DictItem[]; total: number; readonly: boolean }>(
      `/masterdata/dict/${dictType}`,
      params,
    )
  },
  createDictItem(dictType: string, payload: Record<string, any>) {
    return http.post(`/masterdata/dict/${dictType}`, payload)
  },
  updateDictItem(id: number, payload: Record<string, any>) {
    return http.put(`/masterdata/dict/item/${id}`, payload)
  },
  toggleDictItem(id: number) {
    return http.post(`/masterdata/dict/item/${id}/toggle`)
  },
  removeDictItem(id: number) {
    return http.del(`/masterdata/dict/item/${id}`)
  },
  list(entity: string, params: Record<string, any> = {}) {
    return http.get<PageResult<MasterRecord>>(`/masterdata/${entity}/list`, params)
  },
  create(entity: string, payload: Record<string, any>) {
    return http.post(`/masterdata/${entity}`, payload)
  },
  update(entity: string, id: number, payload: Record<string, any>) {
    return http.put(`/masterdata/${entity}/${id}`, payload)
  },
  remove(entity: string, id: number) {
    return http.del(`/masterdata/${entity}/${id}`)
  },
}
