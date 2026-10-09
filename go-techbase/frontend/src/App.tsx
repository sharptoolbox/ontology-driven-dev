import { useEffect, useState } from 'react'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { store } from './store'
import AppRoutes from './router'
import { ThemeProvider, THEME_STORAGE_KEY, type ThemeMode } from './theme/ThemeContext'
import { useGlassPointerLight } from './theme/useGlassPointerLight'
// 玻璃主题样式(全部 [data-glass] 作用域,由本组件根节点统一挂载;login.css 为品牌页,仅登录页/403 使用)
import './styles/admin-glass.css'
import './styles/admin-layout.css'
import './styles/admin-dashboard.css'
import './styles/admin-list.css'
import './styles/user-workbench.css'
import './styles/login.css'

dayjs.locale('zh-cn')

/**
 * 玻璃应用外壳:主题状态提升到 App 级(持久化沿用 opic_admin_theme)。
 * - 根节点 <div data-glass data-theme> 是全应用唯一 CSS 作用域(深空暗色默认);
 * - 同步镜像到 document.body,供 Modal/Drawer/Dropdown/message 等 Portal 弹层命中;
 * - 登录页/403 为独立品牌页(login.css 自带高优先级覆盖,不受玻璃主题影响)。
 */
function GlassApp() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      // 默认白蓝亮色（用户规则 2026-10-02）；仅显式选过暗色者保留暗色
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      /* 存储不可用时忽略,仅本次会话生效 */
    }
  }, [mode])

  useEffect(() => {
    document.body.setAttribute('data-glass', '')
    document.body.setAttribute('data-theme', mode)
    document.body.style.background = mode === 'dark' ? '#0a0b14' : '#edf3fb'
  }, [mode])

  // 指针高光:鼠标在玻璃卡片内游走时点亮反光光点(全局一次,品牌页无 .ant-card 不受影响)
  useGlassPointerLight(true)

  return (
    <ThemeProvider mode={mode} onModeChange={setMode}>
      <div data-glass="" data-theme={mode}>
        <AppRoutes />
      </div>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <Provider store={store}>
      {/* 顶层 ConfigProvider 保持 antd 默认主题:登录页/403 品牌页零污染;
          玻璃双主题由各布局子树内的 GlassConfigProvider 注入 */}
      <ConfigProvider locale={zhCN}>
        <BrowserRouter>
          <GlassApp />
        </BrowserRouter>
      </ConfigProvider>
    </Provider>
  )
}
