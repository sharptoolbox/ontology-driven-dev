// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 玻璃双主题 antd 配置注入:读取 App 级 ThemeProvider 的 mode,在布局子树内注入
// glassDarkTheme / glassLightTheme(不全局共享 cssVar,登录页/403 品牌页保持默认主题零污染)。
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { useThemeMode } from './ThemeContext'
import { glassDarkTheme, glassLightTheme } from './glassTheme'

export default function GlassConfigProvider({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode()
  return (
    <ConfigProvider locale={zhCN} theme={mode === 'dark' ? glassDarkTheme : glassLightTheme}>
      {children}
    </ConfigProvider>
  )
}
