import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { customerApi, type Customer } from '../../api/customer'
import { metaApi, type DictItem } from '../../api/meta'
import TableToolbar from '../../admin/components/TableToolbar'
import { CustomerStatusPill } from '../../admin/components/StatusPill'

interface FilterValues {
  customer_no?: string
  customer_name?: string
  status?: string
}

export default function CustomerQuery() {
  const navigate = useNavigate()
  const [form] = Form.useForm<FilterValues>()
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [statuses, setStatuses] = useState<string[]>([])
  const [typeDict, setTypeDict] = useState<DictItem[]>([])
  const [levelDict, setLevelDict] = useState<DictItem[]>([])

  const typeLabel = useMemo(() => new Map(typeDict.map((d) => [d.code, d.label])), [typeDict])
  const levelLabel = useMemo(() => new Map(levelDict.map((d) => [d.code, d.label])), [levelDict])

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const res = await customerApi.list({
        page: p,
        size: s,
        customer_no: values.customer_no,
        customer_name: values.customer_name,
        status: values.status,
      })
      setData(res.list || [])
      setTotal(res.total || 0)
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    metaApi
      .dictionaries()
      .then((d) => {
        setTypeDict(d.CUSTOMER_TYPE || [])
        setLevelDict(d.CUSTOMER_LEVEL || [])
      })
      .catch(() => {})
    metaApi
      .customerStatus()
      .then(setStatuses)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size])

  const handleSearch = () => {
    setPage(1)
    load(1, size)
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    load(1, size)
  }

  const columns: ColumnsType<Customer> = [
    { title: '客户编号', dataIndex: 'customer_no', key: 'customer_no', width: 150 },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name' },
    {
      title: '客户类型',
      dataIndex: 'customer_type',
      key: 'customer_type',
      width: 120,
      render: (v: string) => typeLabel.get(v) || v || '-',
    },
    {
      title: '客户等级',
      dataIndex: 'customer_level',
      key: 'customer_level',
      width: 120,
      render: (v: string) => levelLabel.get(v) || v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (v: string) => <CustomerStatusPill status={v} />,
    },
    {
      title: '申请人',
      dataIndex: 'applicant_name',
      key: 'applicant_name',
      width: 100,
      render: (v: string | null) => v || '-',
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/customer/apply?id=${record.id}`)}>
          查看
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <TableToolbar
        title="客户查询"
        total={total}
        extra={
          <Space wrap>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
        }
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16, rowGap: 8 }}>
        <Form.Item name="customer_no">
          <Input placeholder="客户编号" allowClear style={{ width: 180 }} onPressEnter={handleSearch} />
        </Form.Item>
        <Form.Item name="customer_name">
          <Input placeholder="客户名称" allowClear style={{ width: 180 }} onPressEnter={handleSearch} />
        </Form.Item>
        <Form.Item name="status">
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 180 }}
            options={statuses.map((s) => ({ value: s, label: s }))}
          />
        </Form.Item>
      </Form>
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
