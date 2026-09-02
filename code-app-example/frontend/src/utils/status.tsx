export interface BadgeStyle {
  label: string
  className: string
}

export function statusBadge(status: string): BadgeStyle {
  switch (status) {
    case '已通过':
    case '已批准':
    case '已结清':
    case '已纳入管理':
    case '已登记':
    case '在用':
    case 'APPROVED':
      return { label: status === 'APPROVED' ? '已通过' : status, className: 'badge-success' }
    case '已驳回':
    case '已作废':
    case '已冲销':
    case '已归档':
    case '停用':
    case 'REJECTED':
      return { label: status === 'REJECTED' ? '已驳回' : status, className: 'badge-danger' }
    case '待财务经理审批':
    case '待总经理审批':
    case '待审批':
      return { label: status, className: 'badge-warning' }
    case '部分开票':
    case '部分收款':
      return { label: status, className: 'badge-info' }
    case 'RUNNING':
      return { label: '运行中', className: 'badge-info' }
    case '草稿':
    case '未开票':
    case '未收款':
      return { label: status, className: 'badge-neutral' }
    case '已足额开票':
      return { label: status, className: 'badge-success' }
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
