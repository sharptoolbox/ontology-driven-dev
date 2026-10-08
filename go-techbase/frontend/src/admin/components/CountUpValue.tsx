// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
import { useCountUp } from './useCountUp'

// 数字滚动展示:千分位格式化,配合 tabular-nums 不抖动
export default function CountUpValue({ value }: { value: number }) {
  const display = useCountUp(value)
  return <>{display.toLocaleString()}</>
}
