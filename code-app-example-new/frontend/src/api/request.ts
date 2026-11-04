const TOKEN_KEY = 'cp_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export interface ApiResult<T> {
  success: boolean
  message: string
  data: T
  errorCode: string | null
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

async function send<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...options, headers })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('登录已过期')
  }
  const body: ApiResult<T> = await res.json()
  if (!body.success) {
    throw new Error(body.message || '请求失败')
  }
  return body
}

export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await send<T>(path, options)
  return body.data
}

/** 需要读取后端提示语（如审批结果）时使用，返回 message。 */
export async function requestMessage(path: string, options: RequestInit = {}): Promise<string> {
  const body = await send(path, options)
  return body.message
}

export const http = {
  get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    let url = path
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      if (qs) url += `?${qs}`
    }
    return request<T>(url)
  },
  post<T = any>(path: string, data?: any): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(data || {}) })
  },
  put<T = any>(path: string, data?: any): Promise<T> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(data || {}) })
  },
  del<T = any>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}
