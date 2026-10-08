// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 管理控制台主题上下文:mode 只作用于 /admin 子树(根节点 data-theme + body 镜像),
// 切换支持 View Transition 圆形扩散(不支持时直接切换)。
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'opic_admin_theme'

export const ThemeContext = createContext<{
  mode: ThemeMode
  toggle: (point?: { x: number; y: number }) => void
}>({
  mode: 'dark',
  toggle: () => {},
})

export const useThemeMode = () => useContext(ThemeContext)

// View Transitions API(Chromium 111+ / Safari 18+),不支持时直接切换
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

interface ThemeProviderProps {
  mode: ThemeMode
  onModeChange: (mode: ThemeMode) => void
  children: ReactNode
}

/**
 * 主题 Provider:把 mode/toggle 提供给控制台子树。
 * toggle 时同步把 data-theme 写到 documentElement 的 data-theme 镜像点
 * (由调用方通过 body 镜像 effect 处理),这里只负责动画编排。
 */
export function ThemeProvider({ mode, onModeChange, children }: ThemeProviderProps) {
  const toggle = useCallback(
    (point?: { x: number; y: number }) => {
      const next: ThemeMode = mode === 'light' ? 'dark' : 'light'
      const apply = () => onModeChange(next)
      const doc = document as ViewTransitionDocument
      if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        apply()
        return
      }
      // 新主题从切换按钮处以圆形"液面"漫开
      const x = point?.x ?? window.innerWidth / 2
      const y = point?.y ?? 60
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      doc
        .startViewTransition(() => {
          flushSync(apply)
        })
        .ready.then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            {
              duration: 620,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            },
          )
        })
        .catch(() => {
          // 快速连点导致过渡被跳过时静默,主题本身已切换
        })
    },
    [mode, onModeChange],
  )

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
