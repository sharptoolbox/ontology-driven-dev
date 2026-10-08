// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 指针高光:把鼠标在卡片内的坐标写进 --lgx/--lgy,
// admin-glass.css 里 .ant-card::after / login-shell 的反光光点跟着游走。
// enabled=false 时完全不动 DOM(用户工作台零污染)。
import { useEffect } from 'react'

export function useGlassPointerLight(enabled: boolean, selector = '.ant-card, .login-shell') {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let lit: HTMLElement | null = null
    const clear = () => {
      lit?.style.removeProperty('--lgx')
      lit?.style.removeProperty('--lgy')
      lit?.classList.remove('is-pointer-lit')
      lit = null
    }
    let last: PointerEvent | null = null
    const onMove = (e: PointerEvent) => {
      last = e
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const ev = last
        if (!ev) return
        const el =
          ev.target instanceof Element ? ev.target.closest<HTMLElement>(selector) : null
        if (lit && lit !== el) clear()
        if (el) {
          const rect = el.getBoundingClientRect()
          el.style.setProperty('--lgx', `${Math.round(ev.clientX - rect.left)}px`)
          el.style.setProperty('--lgy', `${Math.round(ev.clientY - rect.top)}px`)
          el.classList.add('is-pointer-lit')
          lit = el
        }
      })
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', clear)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', clear)
      cancelAnimationFrame(raf)
      clear()
    }
  }, [enabled, selector])
}
