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
  type?: string
  children?: MenuItem[]
}

export interface LoginPayload {
  token: string
  user: UserInfo
  permissions: string[]
  menus: MenuItem[]
}

export type AuthInfo = Omit<LoginPayload, 'token'>

export const authApi = {
  casdoorLoginUrl() {
    return http.get<{ url: string }>('/api/auth/casdoor/login-url')
  },
  captcha() {
    return http.get<{ captcha_id: string; image: string; ttl: number }>('/api/auth/captcha')
  },
  login(username: string, password: string, captchaId?: string, captchaCode?: string) {
    return http.post<LoginPayload>('/api/auth/login', {
      username, password, captcha_id: captchaId, captcha_code: captchaCode,
    })
  },
  info() {
    return http.get<AuthInfo>('/api/auth/info')
  },
  logout() {
    return http.post('/api/auth/logout')
  },
  mode() {
    return http.get<{ mode: string; allow_local_login: boolean }>('/api/auth/mode')
  },
  zitadelLoginUrl() {
    return http.get<{ url: string }>('/api/auth/login-url')
  },
}
