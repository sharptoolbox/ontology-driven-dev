// 管理控制台权限判定(纯函数,登录页/路由守卫/工作台入口共用,不改动既有 store/api 导出)。
// 管理权限 = permissions 含 '*',或任一 'system:' / 'flow:' 前缀权限码。

export function isAdminPermissions(permissions: string[] | undefined | null): boolean {
  if (!permissions || permissions.length === 0) return false
  return permissions.some(
    (p) => p === '*' || p.startsWith('system:') || p.startsWith('flow:'),
  )
}

export function hasPermPrefix(permissions: string[] | undefined | null, prefix: string): boolean {
  if (!permissions || permissions.length === 0) return false
  return permissions.some((p) => p === '*' || p.startsWith(prefix))
}
