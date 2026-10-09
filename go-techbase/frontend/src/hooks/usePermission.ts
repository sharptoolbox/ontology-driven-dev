import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'

/**
 * 按钮级权限判断:当前用户 permissions 含 '*' 即超管,全部可见。
 * hasPerm('customer:save'); hasPerm(['system:user:add', 'system:user:edit']) 任一命中即可。
 */
export function usePermission() {
  const permissions = useSelector((s: RootState) => s.auth.permissions)
  return useCallback(
    (codes: string | string[]): boolean => {
      if (permissions.includes('*')) return true
      const list = Array.isArray(codes) ? codes : [codes]
      return list.some((c) => permissions.includes(c))
    },
    [permissions],
  )
}
