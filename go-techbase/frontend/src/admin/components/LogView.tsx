/** 日志审计通用表格(操作/登录/审计三视图复用) */
import { useEffect, useState } from 'react'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminConsoleApi, type AuditLogRow } from '../../api/adminconsole'

const actionColor: Record<string, string> = {
  LOGIN: 'green',
  LOGOUT: 'default',
  SUBMIT: 'blue',
  APPROVE: 'green',
  REJECT: 'red',
  RETURN: 'orange',
}

export default function LogView({ kind, title }: { kind: 'operation' | 'login' | 'audit'; title: string }) {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const size = 15

  const load = (p: number) => {
    setLoading(true)
    const fn =
      kind === 'login' ? adminConsoleApi.loginLogs : kind === 'audit' ? adminConsoleApi.auditLogs : adminConsoleApi.operationLogs
    fn(p, size)
      .then((res) => {
        setRows(res.list ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: ColumnsType<AuditLogRow> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '用户', dataIndex: 'username', width: 120 },
    {
      title: '动作',
      dataIndex: 'action',
      width: 110,
      render: (v: string) => <Tag color={actionColor[v] ?? 'blue'}>{v}</Tag>,
    },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 180 },
  ]

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ current: page, pageSize: size, total, onChange: (p) => { setPage(p); load(p) } }}
      />
    </div>
  )
}
