import { http } from './request'

export interface UserInfo {
  id: number
  username: string
  real_name: string
  actor_type: string
  roles: string[]
}

export interface MenuItem {
  id: number
  name: string
  code: string
  icon: string | null
  path: string | null
  permission_code?: string | null
  children?: MenuItem[]
}

export interface LoginPayload {
  token: string
  user: UserInfo
  permissions: string[]
  menus: MenuItem[]
}

export const authApi = {
  login(username: string, password: string) {
    return http.post<LoginPayload>('/auth/login', { username, password })
  },
  info() {
    return http.get<Omit<LoginPayload, 'token'>>('/auth/info')
  },
  logout() {
    return http.post('/auth/logout')
  },
}
