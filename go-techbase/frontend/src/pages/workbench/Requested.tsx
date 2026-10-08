import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Popconfirm, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { workbenchApi, type RequestedItem } from '../../api/flow'
import { customerApi } from '../../api/customer'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'
import { CustomerStatusPill, InstanceStatusPill } from '../../admin/components/StatusPill'

export default function Requested() {
  const navigate = useNavigate()
  const hasPerm = usePermission()
  const [data, setData] = useState<RequestedItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const res = await workbenchApi.requested({ page: p, size: s })
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

  const handleWithdraw = async (c: RequestedItem) => {
    try {
      await customerApi.withdraw(c.id)
      message.success('已撤回')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const columns: ColumnsType<RequestedItem> = [
    { title: '客户编号', dataIndex: 'customer_no', key: 'customer_no', width: 150 },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (v: string) => <CustomerStatusPill status={v} />,
    },
    {
      title: '流程状态',
      dataIndex: 'flow_status',
      key: 'flow_status',
      width: 130,
      render: (v: string | undefined) => (v ? <InstanceStatusPill status={v} /> : '-'),
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/customer/apply?id=${record.id}`)}>
            查看
          </Button>
          {record.status === '待客户经理审批' && hasPerm('customer:submit') && (
            <Popconfirm
              title={`确认撤回客户「${record.customer_name}」的申请？`}
              onConfirm={() => handleWithdraw(record)}
            >
              <Button type="link" size="small" danger>
                撤回
              </Button>
            </Popconfirm>
          )}
        </>
      ),
    },
  ]

  return (
    <Card>
      <TableToolbar
        title="我的申请"
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
