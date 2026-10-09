import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'

const TOKEN_KEY = 'cp_token'
const SUCCESS_CODE = 'SUC0000'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** OPIC 统一响应结构(O-ARC):returnInfo{returnCode, errorMsg} + data */
export interface ApiResult<T> {
  returnInfo: { returnCode: string; errorMsg: string }
  data: T
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 15000,
})

instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResult<unknown>
    if (!body || !body.returnInfo || body.returnInfo.returnCode !== SUCCESS_CODE) {
      const code = body?.returnInfo?.returnCode || 'UNKNOWN'
      const errorMsg = body?.returnInfo?.errorMsg || '请求失败'
      message.error(`[${code}] ${errorMsg}`)
      return Promise.reject(new Error(`[${code}] ${errorMsg}`))
    }
    // 成功直接返回 data 字段内容
    return body.data as any
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/** 剔除查询参数中值为 undefined/null/'' 的项 */
export function cleanParams(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export const http = {
  get<T = any>(path: string, params?: Record<string, unknown>): Promise<T> {
    // 响应拦截器已将返回值解包为 data 字段内容
    return instance.get(path, { params: cleanParams(params) }) as unknown as Promise<T>
  },
  post<T = any>(path: string, data?: unknown): Promise<T> {
    return instance.post(path, data ?? {}) as unknown as Promise<T>
  },
  put<T = any>(path: string, data?: unknown): Promise<T> {
    return instance.put(path, data ?? {}) as unknown as Promise<T>
  },
  del<T = any>(path: string): Promise<T> {
    return instance.delete(path) as unknown as Promise<T>
  },
}
