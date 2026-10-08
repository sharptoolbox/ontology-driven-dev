// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 管理控制台 Dashboard:hero 横幅(时段问候 + 渐变用户名 + 信息芯片 + 快捷操作胶囊)、
// 渐变统计卡墙(CountUp + hover 辉光 + 点击跳转)、「近 N 天流程启动趋势」手写 CSS 柱状图
// (前端按 started_at 聚合、按实例 status 分色)、最近流程实例列表 + 用户工作台入口卡。
// 数据全部来自现有真实 API,无新造接口。
import { useEffect, useMemo, useState } from 'react'
import { Card, Col, Row, Skeleton, Tooltip } from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  DesktopOutlined,
  CheckSquareOutlined,
  ArrowRightOutlined,
  LineChartOutlined,
  CalendarOutlined,
  SwapOutlined,
  UserAddOutlined,
  PartitionOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { userApi, roleApi } from '../../api/system'
import { flowApi, workbenchApi } from '../../api/flow'
import { usePermission } from '../../hooks/usePermission'
import { hasPermPrefix } from '../access'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import CountUpValue from '../components/CountUpValue'
import { InstanceStatusPill } from '../components/StatusPill'
import type { FlowInstance } from '../../api/flow'

interface StatCardDef {
  key: string
  title: string
  value: number
  icon: React.ReactNode
  gradient: string
  shadow: string
  tint: string
  path: string
}

const fmt = (v?: string | null) => {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('MM-DD HH:mm') : v
}

/** started_at(TEXT 'YYYY-MM-DD HH24:MI:SS')→ 日期键 */
const dateKeyOf = (v?: string | null) => (v ? v.slice(0, 10) : '')

const STATUS_SEGMENTS = [
  { key: 'running', status: 'RUNNING', label: '运行中', cls: 'trend-bar-running', dot: 'trend-legend-dot-running' },
  { key: 'approved', status: 'APPROVED', label: '已通过', cls: 'trend-bar-approved', dot: 'trend-legend-dot-approved' },
  { key: 'rejected', status: 'REJECTED', label: '已驳回', cls: 'trend-bar-rejected', dot: 'trend-legend-dot-rejected' },
  { key: 'terminated', status: 'TERMINATED', label: '已终止', cls: 'trend-bar-terminated', dot: 'trend-legend-dot-terminated' },
] as const

export default function AdminDashboard() {
  const navigate = useNavigate()
  const hasPerm = usePermission()
  const permissions = useSelector((s: RootState) => s.auth.permissions)
  const user = useSelector((s: RootState) => s.auth.user)

  const [stats, setStats] = useState({ users: 0, roles: 0, instances: 0, todo: 0 })
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<FlowInstance[] | null>(null)
  const [trendDays, setTrendDays] = useState(7)

  useEffect(() => {
    // 四张统计卡:total 来自现有列表接口的 size=1 查询
    const tasks: Promise<unknown>[] = [
      userApi
        .list({ page: 1, size: 1 })
        .then((r) => setStats((s) => ({ ...s, users: r.total || 0 })))
        .catch(() => {}),
      roleApi
        .list({ page: 1, size: 1 })
        .then((r) => setStats((s) => ({ ...s, roles: r.total || 0 })))
        .catch(() => {}),
      flowApi
        .listInstances({ page: 1, size: 1 })
        .then((r) => setStats((s) => ({ ...s, instances: r.total || 0 })))
        .catch(() => {}),
      workbenchApi
        .todo({ page: 1, size: 1 })
        .then((r) => setStats((s) => ({ ...s, todo: r.total || 0 })))
        .catch(() => {}),
      // 趋势 + 最近实例:size=200 内前端聚合
      flowApi
        .listInstances({ page: 1, size: 200 })
        .then((r) => setInstances(r.list || []))
        .catch(() => setInstances([])),
    ]
    Promise.allSettled(tasks).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 趋势聚合(近 N 天,按 status 分桶) ---------- */
  const trend = useMemo(() => {
    const list = instances || []
    const days: { date: string; counts: Record<string, number> }[] = []
    for (let i = trendDays - 1; i >= 0; i -= 1) {
      days.push({ date: dayjs().subtract(i, 'day').format('YYYY-MM-DD'), counts: {} })
    }
    const index = new Map(days.map((d, i) => [d.date, i]))
    for (const ins of list) {
      const key = dateKeyOf(ins.started_at)
      const i = index.get(key)
      if (i === undefined) continue
      const bucket = days[i].counts
      bucket[ins.status] = (bucket[ins.status] || 0) + 1
    }
    return days
  }, [instances, trendDays])

  const maxCount = useMemo(
    () => Math.max(1, ...trend.map((d) => Object.values(d.counts).reduce((a, b) => a + b, 0))),
    [trend],
  )
  const hasTrendData = trend.some((d) => Object.keys(d.counts).length > 0)
  const labelEvery = trend.length > 15 ? 4 : trend.length > 7 ? 2 : 1

  const statCards: StatCardDef[] = [
    {
      key: 'users',
      title: '总用户数',
      value: stats.users,
      icon: <UserOutlined />,
      gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      shadow: 'rgba(79, 70, 229, 0.35)',
      tint: 'rgba(99, 102, 241, 0.14)',
      path: '/admin/system/users',
    },
    {
      key: 'roles',
      title: '角色总数',
      value: stats.roles,
      icon: <TeamOutlined />,
      gradient: 'linear-gradient(135deg, #34d399, #059669)',
      shadow: 'rgba(5, 150, 105, 0.35)',
      tint: 'rgba(16, 185, 129, 0.12)',
      path: '/admin/system/roles',
    },
    {
      key: 'instances',
      title: '流程实例总数',
      value: stats.instances,
      icon: <DesktopOutlined />,
      gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
      shadow: 'rgba(245, 158, 11, 0.35)',
      tint: 'rgba(245, 158, 11, 0.11)',
      path: '/admin/flow/instances',
    },
    {
      key: 'todo',
      title: '我的待办',
      value: stats.todo,
      icon: <CheckSquareOutlined />,
      gradient: 'linear-gradient(135deg, #f472b6, #db2777)',
      shadow: 'rgba(219, 39, 119, 0.35)',
      tint: 'rgba(219, 39, 119, 0.11)',
      path: '/workbench/todo',
    },
  ]

  const hour = new Date().getHours()
  const greeting =
    hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  // 快捷操作胶囊(按权限过滤)
  const heroActions = [
    { label: '新建用户', icon: <UserAddOutlined />, path: '/admin/system/users', visible: hasPerm('system:user:add') },
    { label: '角色管理', icon: <TeamOutlined />, path: '/admin/system/roles', visible: hasPermPrefix(permissions, 'system:') },
    { label: '发布流程', icon: <RocketOutlined />, path: '/admin/flow/definitions', visible: hasPerm('flow:definition:publish') || hasPerm('flow:definition:add') },
    { label: '用户工作台', icon: <SwapOutlined />, path: '/customer/apply', visible: true },
  ].filter((a) => a.visible)

  const recent = (instances || []).slice(0, 5)

  return (
    <div className="dash-page">
      {/* ===== Hero 横幅 ===== */}
      <div className="dash-hero liquid-dash is-alive">
        <div className="liquid-sheen" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="dash-hero-main">
          <div className="dash-hero-content">
            <div className="dash-hero-greeting">
              {greeting},<em>{user?.real_name || user?.username || '管理员'}</em>
            </div>
            <div className="dash-hero-sub">欢迎回到 OPIC 技术底座管理控制台 · 以本体驱动,筑智能算力底座</div>
            <div className="dash-hero-chips">
              <span className="hero-chip">
                <CalendarOutlined />
                {dayjs().format('YYYY年M月D日')} · {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs().day()]}
              </span>
              <span className="hero-chip">
                <LineChartOutlined />
                近 {trendDays} 天启动 {trend.reduce((acc, d) => acc + Object.values(d.counts).reduce((a, b) => a + b, 0), 0)} 个流程
              </span>
            </div>
            <div className="dash-hero-actions">
              {heroActions.map((a) => (
                <button key={a.path} type="button" className="hero-action" onClick={() => navigate(a.path)}>
                  {a.icon}
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 轨道装饰:两圈细环 + 沿环公转的光点 */}
        <div className="dash-hero-orbit" aria-hidden>
          <span className="orbit-ring orbit-ring-1">
            <span className="orbit-dot" />
          </span>
          <span className="orbit-ring orbit-ring-2">
            <span className="orbit-dot orbit-dot-2" />
          </span>
        </div>
        <div className="dash-hero-glow" />
      </div>

      {/* ===== 渐变统计卡墙 ===== */}
      <Row gutter={[20, 20]}>
        {statCards.map((c, i) => (
          <Col xs={24} sm={12} lg={6} key={c.key}>
            <Card
              className="stat-card glass-rise liquid-dash-stat is-alive"
              hoverable
              styles={{ body: { padding: 20 } }}
              style={{ '--tint': c.tint, '--i': i } as React.CSSProperties}
              onClick={() => navigate(c.path)}
            >
              <div className="liquid-sheen" aria-hidden="true">
                <i />
                <i />
              </div>
              <div className="stat-card-row">
                <div>
                  <div className="stat-card-title">{c.title}</div>
                  {loading ? (
                    <Skeleton.Button active size="large" style={{ width: 72, height: 36, marginTop: 6 }} />
                  ) : (
                    <div className="stat-card-value">
                      <CountUpValue value={c.value} />
                    </div>
                  )}
                </div>
                <div
                  className="stat-card-icon"
                  style={{ background: c.gradient, '--icon-shadow': c.shadow } as React.CSSProperties}
                >
                  {c.icon}
                </div>
              </div>
              <div className="stat-card-foot">
                查看详情 <ArrowRightOutlined />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ===== 趋势图 + 最近实例 ===== */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={16}>
          <Card
            className="liquid-dash-panel is-alive"
            title={
              <span>
                <LineChartOutlined className="card-title-icon" />
                近 {trendDays} 天流程启动趋势
              </span>
            }
            extra={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="trend-days" role="group" aria-label="趋势天数">
                  {([7, 15, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`trend-days-btn${trendDays === d ? ' is-active' : ''}`}
                      aria-pressed={trendDays === d}
                      onClick={() => setTrendDays(d)}
                    >
                      {d} 天
                    </button>
                  ))}
                </div>
                <div className="trend-legend">
                  {STATUS_SEGMENTS.map((seg) => (
                    <span key={seg.key}>
                      <span className={`trend-legend-dot ${seg.dot}`} />
                      {seg.label}
                    </span>
                  ))}
                </div>
              </div>
            }
            style={{ height: '100%' }}
          >
            <div className="liquid-sheen" aria-hidden="true">
              <i />
              <i />
            </div>
            {instances === null ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : !hasTrendData ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--og-text-secondary)' }}>
                近 {trendDays} 天暂无流程启动记录
              </div>
            ) : (
              <div className="trend-chart" style={{ gap: trend.length > 15 ? 4 : trend.length > 7 ? 8 : 12 }}>
                {trend.map((d, i) => {
                  const total = Object.values(d.counts).reduce((a, b) => a + b, 0)
                  return (
                    <div className="trend-col" key={d.date}>
                      <div className="trend-count">{trend.length <= 7 && total > 0 ? total : ''}</div>
                      <Tooltip
                        title={
                          <>
                            {d.date}
                            {total === 0
                              ? ' · 无启动'
                              : STATUS_SEGMENTS.map(
                                  (seg) => ` · ${seg.label} ${d.counts[seg.status] || 0}`,
                                )}
                          </>
                        }
                      >
                        <div className="trend-bar-area">
                          {STATUS_SEGMENTS.filter((seg) => (d.counts[seg.status] || 0) > 0)
                            // 运行中在最下方,终态叠在上面
                            .slice()
                            .reverse()
                            .map((seg) => (
                              <div
                                key={seg.key}
                                className={seg.cls}
                                style={{ height: `${((d.counts[seg.status] || 0) / maxCount) * 100}%` }}
                              />
                            ))}
                        </div>
                      </Tooltip>
                      <div className="trend-date">{i % labelEvery === 0 ? dayjs(d.date).format('MM-DD') : ''}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
            <Card
              className="liquid-dash-panel is-alive"
              title={
                <span>
                  <DesktopOutlined className="card-title-icon" />
                  最近流程实例
                </span>
              }
              extra={
                <a onClick={() => navigate('/admin/flow/instances')}>更多</a>
              }
              style={{ flex: 1 }}
              styles={{ body: { padding: '8px 16px' } }}
            >
              <div className="liquid-sheen" aria-hidden="true">
                <i />
                <i />
              </div>
              {instances === null ? (
                <Skeleton active paragraph={{ rows: 3 }} />
              ) : recent.length === 0 ? (
                <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--og-text-secondary)' }}>
                  暂无流程实例
                </div>
              ) : (
                recent.map((ins) => (
                  <Tooltip title={`${ins.def_name || ins.def_code || ''} · ${ins.business_key}`} key={ins.id}>
                    <div className="dash-recent-item" onClick={() => navigate('/admin/flow/instances')}>
                      <span className="dash-recent-title">
                        {ins.business_key}
                        <span style={{ opacity: 0.75 }}> · {ins.def_name || ins.def_code || '-'}</span>
                      </span>
                      <InstanceStatusPill status={ins.status} />
                      <span className="dash-recent-time">{fmt(ins.started_at)}</span>
                    </div>
                  </Tooltip>
                ))
              )}
            </Card>

            <Card
              className="stat-card liquid-dash-stat is-alive"
              hoverable
              onClick={() => navigate('/customer/apply')}
              styles={{ body: { padding: 20 } }}
              style={{ '--tint': 'rgba(14, 165, 233, 0.13)' } as React.CSSProperties}
            >
              <div className="liquid-sheen" aria-hidden="true">
                <i />
                <i />
              </div>
              <div className="stat-card-row">
                <div>
                  <div className="stat-card-title">进入用户工作台</div>
                  <div style={{ marginTop: 8, color: 'var(--og-text-secondary)', fontSize: 13 }}>
                    客户接入 · 我的待办 · 我发起的
                  </div>
                </div>
                <div
                  className="stat-card-icon"
                  style={
                    {
                      background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                      '--icon-shadow': 'rgba(2,132,199,0.35)',
                    } as React.CSSProperties
                  }
                >
                  <SwapOutlined />
                </div>
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  )
}
