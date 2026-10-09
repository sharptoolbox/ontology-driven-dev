import { useEffect, useState } from 'react'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminConsoleApi, type NamedCode } from '../../api/adminconsole'

export default function ErrCodes() {
  const [rows, setRows] = useState<NamedCode[]>([])
  useEffect(() => {
    adminConsoleApi.errCodes().then((r) => setRows(Array.isArray(r) ? r : []))
  }, [])
  const columns: ColumnsType<NamedCode> = [
    { title: '错误码', dataIndex: 'code', width: 160, render: (v: string) => <Tag color="geekblue">{v}</Tag> },
    { title: '说明', dataIndex: 'desc' },
  ]
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0 }}>错误码管理（O-ARC 登记表，只读）</h3>
      <Table rowKey="code" size="small" columns={columns} dataSource={rows} pagination={false} />
    </div>
  )
}
