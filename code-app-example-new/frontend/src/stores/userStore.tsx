import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { LoginPayload, MenuItem, UserInfo } from '../api/auth'
import { clearToken, getToken, setToken } from '../api/request'

interface AuthState {
  token: string | null
  user: UserInfo | null
  permissions: string[]
  menus: MenuItem[]
}

interface AuthContextValue extends AuthState {
  login: (payload: LoginPayload) => void
  setInfo: (payload: Omit<LoginPayload, 'token'>) => void
  logout: () => void
  hasPerm: (code?: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: getToken(),
    user: null,
    permissions: [],
    menus: [],
  })

  const login = useCallback((payload: LoginPayload) => {
    setToken(payload.token)
    setState({
      token: payload.token,
      user: payload.user,
      permissions: payload.permissions,
      menus: payload.menus,
    })
  }, [])

  const setInfo = useCallback((payload: Omit<LoginPayload, 'token'>) => {
    setState((s) => ({
      ...s,
      user: payload.user,
      permissions: payload.permissions,
      menus: payload.menus,
    }))
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setState({ token: null, user: null, permissions: [], menus: [] })
  }, [])

  const hasPerm = useCallback(
    (code?: string) => {
      if (!code) return true
      if (state.permissions.includes('*')) return true
      return state.permissions.includes(code)
    },
    [state.permissions],
  )

  return (
    <AuthContext.Provider value={{ ...state, login, setInfo, logout, hasPerm }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function usePermission() {
  const { hasPerm } = useAuth()
  return hasPerm
}
