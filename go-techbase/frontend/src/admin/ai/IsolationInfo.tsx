import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Badge, Descriptions, Spin, message } from 'antd'
import {
  ApartmentOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  PartitionOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { http } from '../../api/request'

// 隔离信息页（管理控制台 → 系统工具;用户规则 2026-10）。
// 展示本能力中心的隔离边界:中心域码 / PostgreSQL schema / NATS JetStream / Temporal / Redis。
// 数据源 GET /api/admin/isolation(配置态 + 运行态实时校验)。
interface IsolationData {
  center: { code: string; description: string }
  postgresql: {
    host: string; port: number; database: string; schema: string; user: string
    sslmode: string; pool: string; schema_exists: boolean; table_count: number; migration_version: string
  }
  eventbus: { driver: string; url: string; stream: string; subject_prefix: string; max_age_days: number; note: string }
  workflow: { driver: string; address: string; namespace: string; task_queue: string; storage: string; note: string }
  nats_storage: { mode: string; path: string; note: string }
  redis: { enabled: boolean; host: string; port: number; db: number; note: string }
}

const card: CSSProperties = {
  border: '1px solid #ececec',
  borderRadius: 14,
  padding: '14px 18px',
  marginBottom: 12,
  background: '#fff',
}

const title = (icon: ReactNode, text: string, extra?: ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <span
      style={{
        width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', background: '#e8f1ff', color: '#2266e3', fontSize: 15,
      }}
    >
      {icon}
    </span>
    <b style={{ fontSize: 14 }}>{text}</b>
    {extra}
  </div>
)

export default function IsolationPage() {
  const [data, setData] = useState<IsolationData | null>(null)

  useEffect(() => {
    http
      .get<IsolationData>('/api/admin/isolation')
      .then(setData)
      .catch((e) => message.error(e instanceof Error ? e.message : '加载失败'))
  }, [])

  if (!data) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Spin tip="加载隔离信息…" />
      </div>
    )
  }

  const pg = data.postgresql

  return (
    <div style={{ maxWidth: 760, padding: 16 }}>
      <h3 style={{ marginBottom: 4 }}>中心隔离信息</h3>
      <p style={{ color: '#888', fontSize: 13 }}>
        本技术底座按 MCC 架构与其他能力中心隔离：数据按 schema、事件按 JetStream 主题、任务按 TaskQueue。
      </p>

      {/* 中心标识 */}
      <div style={card}>
        {title(<PartitionOutlined />, '中心标识')}
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="中心域码（CENTER_CODE）">
            <b style={{ color: '#2266e3' }}>{data.center.code}</b>
          </Descriptions.Item>
          <Descriptions.Item label="说明">{data.center.description}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* PostgreSQL */}
      <div style={card}>
        {title(
          <DatabaseOutlined />,
          'PostgreSQL（数据隔离 · OPIC-DB-SCHEMA-01）',
          <Badge
            status={pg.schema_exists ? 'success' : 'error'}
            text={pg.schema_exists ? 'schema 正常' : 'schema 缺失'}
          />,
        )}
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="实例">{pg.host}:{pg.port}</Descriptions.Item>
          <Descriptions.Item label="数据库">{pg.database}</Descriptions.Item>
          <Descriptions.Item label="Schema">
            <b style={{ color: '#2266e3' }}>{pg.schema}</b>
          </Descriptions.Item>
          <Descriptions.Item label="连接用户">{pg.user}</Descriptions.Item>
          <Descriptions.Item label="连接池">{pg.pool}</Descriptions.Item>
          <Descriptions.Item label="SSL">{pg.sslmode}</Descriptions.Item>
          <Descriptions.Item label="本 schema 表数量">{pg.table_count}</Descriptions.Item>
          <Descriptions.Item label="迁移版本（goose）">v{pg.migration_version || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* NATS 事件总线 */}
      <div style={card}>
        {title(<ThunderboltOutlined />, 'NATS 事件总线（事件隔离）')}
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="驱动">{data.eventbus.driver}</Descriptions.Item>
          <Descriptions.Item label="地址">{data.eventbus.url || '-'}</Descriptions.Item>
          <Descriptions.Item label="JetStream 流">
            <b style={{ color: '#2266e3' }}>{data.eventbus.stream}</b>
          </Descriptions.Item>
          <Descriptions.Item label="主题前缀">
            <b style={{ color: '#2266e3' }}>{data.eventbus.subject_prefix}&gt;</b>
          </Descriptions.Item>
          <Descriptions.Item label="事件保留">{data.eventbus.max_age_days} 天</Descriptions.Item>
          <Descriptions.Item label="说明">{data.eventbus.note}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* Temporal 工作流 */}
      <div style={card}>
        {title(<ApartmentOutlined />, 'Temporal 工作流（任务隔离）')}
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="驱动">{data.workflow.driver}</Descriptions.Item>
          <Descriptions.Item label="前端地址">{data.workflow.address}</Descriptions.Item>
          <Descriptions.Item label="Namespace">
            <b style={{ color: '#2266e3' }}>{data.workflow.namespace}</b>
          </Descriptions.Item>
          <Descriptions.Item label="TaskQueue">
            <b style={{ color: '#2266e3' }}>{data.workflow.task_queue}</b>
          </Descriptions.Item>
          <Descriptions.Item label="持久化存储">
            <b style={{ color: '#2266e3' }}>Pigsty · temporal 库</b>
          </Descriptions.Item>
          <Descriptions.Item label="存储说明" span={2}>{data.workflow.storage}</Descriptions.Item>
          <Descriptions.Item label="说明" span={2}>{data.workflow.note}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* NATS 存储 */}
      <div style={card}>
        {title(<ThunderboltOutlined />, 'NATS 持久化（文件存储 · 无外部数据库）')}
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="形态">{data.nats_storage.mode}</Descriptions.Item>
          <Descriptions.Item label="数据目录">
            <b style={{ color: '#2266e3' }}>{data.nats_storage.path}</b>
          </Descriptions.Item>
          <Descriptions.Item label="说明" span={2}>{data.nats_storage.note}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* Redis */}
      <div style={card}>
        {title(
          <CloudServerOutlined />,
          'Redis（可选组件）',
          <Badge status={data.redis.enabled ? 'success' : 'default'} text={data.redis.enabled ? '已启用' : '未启用'} />,
        )}
        {data.redis.enabled && (
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="地址">{data.redis.host}:{data.redis.port}</Descriptions.Item>
            <Descriptions.Item label="DB">{data.redis.db}</Descriptions.Item>
            <Descriptions.Item label="用途" span={2}>{data.redis.note}</Descriptions.Item>
          </Descriptions>
        )}
      </div>
    </div>
  )
}
