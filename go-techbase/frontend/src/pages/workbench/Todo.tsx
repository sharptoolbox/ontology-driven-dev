import { useEffect, useState } from 'react'
import { Button, Card, Input, Modal, Space, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import { workbenchApi, type TodoItem } from '../../api/flow'
import TableToolbar from '../../admin/components/TableToolbar'

type PendingAction = 'approve' | 'reject' | 'return'

export default function Todo() {
  const [data, setData] = useState<TodoItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState<TodoItem | null>(null)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const res = await workbenchApi.todo({ page: p, size: s })
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

  const doAction = async (action: PendingAction) => {
    if (!current) return
    setActing(true)
    try {
      if (action === 'approve') await workbenchApi.approve(current.id, comment)
      else if (action === 'reject') await workbenchApi.reject(current.id, comment)
      else await workbenchApi.returnTask(current.id, comment)
      message.success(action === 'approve' ? '审批通过' : action === 'reject' ? '已驳回' : '已退回')
      setCurrent(null)
      setComment('')
      load()
    } catch {
      // 拦截器已提示
    } finally {
      setActing(false)
    }
  }

  const columns: ColumnsType<TodoItem> = [
    {
      title: '客户编号',
      dataIndex: 'customer_no',
      key: 'customer_no',
      width: 150,
      render: (v: string | undefined, r) => v || r.business_key || '-',
    },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', render: (v) => v || '-' },
    { title: '审批节点', dataIndex: 'activity_name', key: 'activity_name', width: 180 },
    { title: '提交人', dataIndex: 'applicant_name', key: 'applicant_name', width: 120, render: (v) => v || '-' },
    { title: '提交时间', dataIndex: 'started_at', key: 'started_at', width: 180, render: (v) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setCurrent(record)
            setComment('')
          }}
        >
          处理
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <TableToolbar
        title="我的待办"
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

      <Modal
        title="审批处理"
        open={!!current}
        onCancel={() => setCurrent(null)}
        footer={
          <Space>
            <Button danger loading={acting} onClick={() => doAction('reject')}>
              驳回
            </Button>
            <Button loading={acting} onClick={() => doAction('return')}>
              退回
            </Button>
            <Button type="primary" loading={acting} onClick={() => doAction('approve')}>
              通过
            </Button>
          </Space>
        }
      >
        <p style={{ color: '#888' }}>
          客户：{current?.customer_name || '-'}（{current?.customer_no || current?.business_key || '-'}） · 节点：
          {current?.activity_name}
        </p>
        <Input.TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="审批意见(可空)"
        />
      </Modal>
    </Card>
  )
}
