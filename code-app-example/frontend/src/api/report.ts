import { http, type PageResult } from './request'

export const reportApi = {
  execution(params: any) {
    return http.get<PageResult<any>>('/report/execution', params)
  },
  dept(params: any) {
    return http.get<any[]>('/report/dept', params)
  },
  unreceived(params: any) {
    return http.get<PageResult<any>>('/report/unreceived', params)
  },
}
