// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 列表页工具条:渐变徽章图标 + 标题 + 描述 + 数量徽标,右侧可挂 extra 操作区。
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import {
  UserOutlined,
  TeamOutlined,
  SafetyOutlined,
  FolderOutlined,
  PartitionOutlined,
  DesktopOutlined,
  SolutionOutlined,
  SearchOutlined,
  InboxOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
} from '@ant-design/icons'

interface ToolbarPreset {
  icon: ReactNode
  gradient: string
  glow: string
  description: string
}

// OPIC 管理端页面标题 → 徽章预设;不在表里时退回"渐变竖线"样式。
const PRESETS: Record<string, ToolbarPreset> = {
  用户管理: {
    icon: <UserOutlined />,
    gradient: 'linear-gradient(135deg, #818cf8, #4f46e5)',
    glow: 'rgba(79, 70, 229, 0.4)',
    description: '账号、角色指派与启停管理',
  },
  角色管理: {
    icon: <TeamOutlined />,
    gradient: 'linear-gradient(135deg, #34d399, #059669)',
    glow: 'rgba(5, 150, 105, 0.4)',
    description: '角色定义、权限组合与资源指派',
  },
  权限管理: {
    icon: <SafetyOutlined />,
    gradient: 'linear-gradient(135deg, #fbbf24, #d97706)',
    glow: 'rgba(217, 119, 6, 0.4)',
    description: '细粒度权限点与数据访问控制',
  },
  '资源管理(菜单 / 按钮 / 接口)': {
    icon: <FolderOutlined />,
    gradient: 'linear-gradient(135deg, #38bdf8, #0284c7)',
    glow: 'rgba(2, 132, 199, 0.4)',
    description: '菜单树、按钮与接口资源的统一登记',
  },
  流程定义: {
    icon: <PartitionOutlined />,
    gradient: 'linear-gradient(135deg, #a78bfa, #6d28d9)',
    glow: 'rgba(109, 40, 217, 0.4)',
    description: '审批流程模型、版本与发布',
  },
  流程实例: {
    icon: <DesktopOutlined />,
    gradient: 'linear-gradient(135deg, #2dd4bf, #0d9488)',
    glow: 'rgba(13, 148, 136, 0.4)',
    description: '全部流程实例进度,运行中实例可终止',
  },
  任务管理: {
    icon: <SolutionOutlined />,
    gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)',
    glow: 'rgba(37, 99, 235, 0.4)',
    description: '全部流程任务查询、转办与催办',
  },
  // 工作台列表页预设
  客户查询: {
    icon: <SearchOutlined />,
    gradient: 'linear-gradient(135deg, #38bdf8, #0284c7)',
    glow: 'rgba(2, 132, 199, 0.4)',
    description: '按编号、名称与状态检索客户申请',
  },
  我的待办: {
    icon: <InboxOutlined />,
    gradient: 'linear-gradient(135deg, #fbbf24, #d97706)',
    glow: 'rgba(217, 119, 6, 0.4)',
    description: '待我处理的审批任务,可驳回 / 退回 / 通过',
  },
  我的申请: {
    icon: <FileTextOutlined />,
    gradient: 'linear-gradient(135deg, #a78bfa, #6d28d9)',
    glow: 'rgba(109, 40, 217, 0.4)',
    description: '我提交的客户申请进度跟踪与撤回',
  },
  我的已办: {
    icon: <CheckSquareOutlined />,
    gradient: 'linear-gradient(135deg, #34d399, #059669)',
    glow: 'rgba(5, 150, 105, 0.4)',
    description: '我经手的审批记录与办理结论',
  },
}

interface TableToolbarProps {
  title: string
  total?: number
  extra?: ReactNode
  /** 覆盖预设徽章图标;标题不在预设表且不传时退回渐变竖线 */
  icon?: ReactNode
  gradient?: string
  glow?: string
  description?: string
}

export default function TableToolbar({
  title,
  total,
  extra,
  icon,
  gradient,
  glow,
  description,
}: TableToolbarProps) {
  const preset = useMemo(() => PRESETS[title], [title])
  const badgeIcon = icon ?? preset?.icon
  const badgeGradient = gradient ?? preset?.gradient
  const badgeGlow = glow ?? preset?.glow
  const desc = description ?? preset?.description

  return (
    <div className="table-toolbar">
      <div className={`table-toolbar-title ${badgeIcon ? 'table-toolbar-title-iconed' : ''}`}>
        {badgeIcon && (
          <span
            className="table-toolbar-badge"
            style={{ background: badgeGradient, '--badge-glow': badgeGlow } as React.CSSProperties}
          >
            {badgeIcon}
          </span>
        )}
        <span className="table-toolbar-text">
          <span className="table-toolbar-heading">
            {title}
            {typeof total === 'number' && <span className="table-count">{total}</span>}
          </span>
          {desc && <span className="table-toolbar-desc">{desc}</span>}
        </span>
      </div>
      {extra && <div className="table-toolbar-extra">{extra}</div>}
    </div>
  )
}
