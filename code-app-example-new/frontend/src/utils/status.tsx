export interface BadgeStyle {
  label: string
  className: string
}

export function statusBadge(status: string): BadgeStyle {
  switch (status) {
    case '已通过':
    case '已批准':
    case '已结清':
    case 'APPROVED':
      return { label: status === 'APPROVED' ? '已通过' : status, className: 'badge-success' }
    case '已驳回':
    case '已作废':
    case 'REJECTED':
      return { label: status === 'REJECTED' ? '已驳回' : status, className: 'badge-danger' }
    case '待审批':
      return { label: status, className: 'badge-warning' }
    case 'RUNNING':
      return { label: '运行中', className: 'badge-info' }
    case '草稿':
      return { label: '草稿', className: 'badge-neutral' }
    case 'TERMINATED':
      return { label: '已终止', className: 'badge-neutral' }
    default:
      return { label: status, className: 'badge-neutral' }
  }
}

export function Badge({ status }: { status: string }) {
  const s = statusBadge(status)
  return <span className={`badge ${s.className}`}>{s.label}</span>
}

export function flowNodeTypeLabel(kind: string): string {
  const map: Record<string, string> = {
    start: '开始',
    end: '结束',
    user_task: '用户任务',
    approval_task: '审批任务',
    system_task: '系统任务',
    behavior_call: '行为调用',
    sub_flow_call: '子流程调用',
    gateway: '网关',
  }
  return map[kind] || kind
}
