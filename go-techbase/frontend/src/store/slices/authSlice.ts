import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { clearToken } from '../../api/request'
import type { AuthInfo, MenuItem, UserInfo } from '../../api/auth'

export interface AuthState {
  token: string | null
  user: UserInfo | null
  permissions: string[]
  menus: MenuItem[]
}

const initialState: AuthState = {
  token: null,
  user: null,
  permissions: [],
  menus: [],
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action: PayloadAction<{ token?: string; info: AuthInfo }>) {
      if (action.payload.token) state.token = action.payload.token
      state.user = action.payload.info.user
      state.permissions = action.payload.info.permissions || []
      state.menus = action.payload.info.menus || []
    },
    clearAuth(state) {
      state.token = null
      state.user = null
      state.permissions = []
      state.menus = []
      clearToken()
    },
  },
})

export const { setAuth, clearAuth } = authSlice.actions
export default authSlice.reducer
