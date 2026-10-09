import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Table } from 'antd'
import { adminConsoleApi } from '../../api/adminconsole'

export default function ServerMonitor() {
  const [stats, setStats] = useState<Record<string, unknown>>({})
  useEffect(() => {
    adminConsoleApi.systemStats().then((r) => setStats(r ?? {}))
  }, [])
  const tables = (stats.db_tables as { table_name: string; row_est: number }[] | undefined) ?? []
  const cards: [string, string | number][] = [
    ['版本', String(stats.version ?? '-')],
    ['Go', String(stats.go_version ?? '-')],
    ['CPU 核数', String(stats.num_cpu ?? '-')],
    ['Goroutines', String(stats.goroutines ?? '-')],
    ['堆内存 (MB)', typeof stats.heap_mb === 'number' ? stats.heap_mb.toFixed(1) : '-'],
    ['运行时长 (秒)', String(stats.uptime_sec ?? '-')],
  ]
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0 }}>系统监控</h3>
      <Row gutter={[12, 12]}>
        {cards.map(([label, v]) => (
          <Col span={4} key={label}>
            <Card size="small"><Statistic title={label} value={v} /></Card>
          </Col>
        ))}
      </Row>
      <h4 style={{ marginTop: 20 }}>数据库表（按行数估算 Top 8）</h4>
      <Table
        rowKey="table_name"
        size="small"
        columns={[
          { title: '表', dataIndex: 'table_name' },
          { title: '估算行数', dataIndex: 'row_est' },
        ]}
        dataSource={tables}
        pagination={false}
      />
    </div>
  )
}
