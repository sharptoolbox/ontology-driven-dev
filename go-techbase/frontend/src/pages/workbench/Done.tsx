import { useEffect, useState } from 'react'
import { Button, Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import { workbenchApi, type DoneItem } from '../../api/flow'
import TableToolbar from '../../admin/components/TableToolbar'

const actionColor: Record<string, string> = {
  APPROVE: 'green',
  REJECT: 'red',
  RETURN: 'orange',
  CANCEL: 'default',
}

const actionLabel: Record<string, string> = {
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  CANCEL: '取消',
}

export default function Done() {
  const [data, setData] = useState<DoneItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const res = await workbenchApi.done({ page: p, size: s })
      setData(res.list || [])
      setTotal(res.total || 0)
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size])

  const columns: ColumnsType<DoneItem> = [
    {
      title: '客户编号',
      dataIndex: 'customer_no',
      key: 'customer_no',
      width: 150,
      render: (v: string | undefined, r) => v || r.business_key || '-',
    },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', render: (v) => v || '-' },
    { title: '审批节点', dataIndex: 'activity_name', key: 'activity_name', width: 160 },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (v: string | null) => (v ? <Tag color={actionColor[v] || 'default'}>{actionLabel[v] || v}</Tag> : '-'),
    },
    { title: '审批意见', dataIndex: 'comment', key: 'comment', render: (v) => v || '-' },
    { title: '办理时间', dataIndex: 'done_at', key: 'done_at', width: 180, render: (v) => v || '-' },
  ]

  return (
    <Card>
      <TableToolbar
        title="我的已办"
        total={total}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => load()}>
            刷新
          </Button>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, s) => {
            setPage(p)
            setSize(s)
          },
        }}
      />
    </Card>
  )
}
