// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 玻璃状态胶囊:呼吸点 + 文字,取代列表页里千篇一律的 Tag。
// tone 决定点和文字的颜色语义;on=true 时点会呼吸(活性)。

export type StatusTone = 'success' | 'muted' | 'danger' | 'info' | 'warning'

interface StatusPillProps {
  tone: StatusTone
  label: string
  /** 呼吸动画,默认 tone==='success' 时开 */
  pulse?: boolean
}

export default function StatusPill({ tone, label, pulse }: StatusPillProps) {
  const active = pulse ?? tone === 'success'
  return (
    <span className={`status-pill status-pill-${tone}`}>
      <span className={`status-pill-dot ${active ? 'status-pill-dot-pulse' : ''}`} />
      {label}
    </span>
  )
}

/** 最常见的 启用(1)/禁用(0) 二态 */
export function EnableStatusPill({ value }: { value: number }) {
  return value === 1 ? (
    <StatusPill tone="success" label="启用" />
  ) : (
    <StatusPill tone="muted" label="禁用" />
  )
}

/** 客户状态 → 胶囊(草稿=muted/待客户经理审批=info/待部门总经理审批=info/已通过=success/已驳回=danger) */
export const CUSTOMER_STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  草稿: { tone: 'muted', label: '草稿' },
  待客户经理审批: { tone: 'info', label: '待客户经理审批' },
  待部门总经理审批: { tone: 'info', label: '待部门总经理审批' },
  已通过: { tone: 'success', label: '已通过' },
  已驳回: { tone: 'danger', label: '已驳回' },
}

export function CustomerStatusPill({ status }: { status: string }) {
  const meta = CUSTOMER_STATUS_TONE[status]
  if (!meta) return <StatusPill tone="muted" label={status} />
  return <StatusPill tone={meta.tone} label={meta.label} />
}

/** 流程实例状态 → 胶囊(RUNNING=info/APPROVED=success/REJECTED=danger/TERMINATED=muted) */
export const INSTANCE_TONE: Record<string, { tone: StatusTone; label: string }> = {
  RUNNING: { tone: 'info', label: '运行中' },
  APPROVED: { tone: 'success', label: '已通过' },
  REJECTED: { tone: 'danger', label: '已驳回' },
  TERMINATED: { tone: 'muted', label: '已终止' },
}

export function InstanceStatusPill({ status }: { status: string }) {
  const meta = INSTANCE_TONE[status]
  if (!meta) return <StatusPill tone="muted" label={status} />
  return <StatusPill tone={meta.tone} label={meta.label} />
}

/** 任务状态 → 胶囊(TODO=info/DONE=success/CANCEL=muted) */
export const TASK_TONE: Record<string, { tone: StatusTone; label: string }> = {
  TODO: { tone: 'info', label: '待办理' },
  DONE: { tone: 'success', label: '已完成' },
  CANCEL: { tone: 'muted', label: '已取消' },
}

export function TaskStatusPill({ status }: { status: string }) {
  const meta = TASK_TONE[status]
  if (!meta) return <StatusPill tone="muted" label={status} />
  return <StatusPill tone={meta.tone} label={meta.label} />
}
