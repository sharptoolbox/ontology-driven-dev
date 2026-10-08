import { useEffect, useState } from 'react'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminConsoleApi, type OnlineUserRow } from '../../api/adminconsole'

export default function OnlineUsers() {
  const [rows, setRows] = useState<OnlineUserRow[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    adminConsoleApi
      .onlineUsers()
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false))
  }, [])
  const columns: ColumnsType<OnlineUserRow> = [
    { title: '用户', dataIndex: 'username' },
    { title: '最近登录', dataIndex: 'last_login', width: 200 },
    { title: '30 分钟内登录次数', dataIndex: 'login_times', width: 180, render: (v: number) => <Tag color="blue">{v}</Tag> },
  ]
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0 }}>在线用户（近 30 分钟口径）</h3>
      <Table rowKey="username" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
    </div>
  )
}
