// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 数字滚动动画:从上一个值缓动到新值(easeOutCubic)。
// 尊重系统"减少动态效果"设置,此时直接跳到目标值。
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const value = Math.round(from + (target - from) * eased)
      setDisplay(value)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}
