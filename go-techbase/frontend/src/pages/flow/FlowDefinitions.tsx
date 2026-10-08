import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Col, Form, Input, Modal, Row, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BranchesOutlined, PlusOutlined, RocketOutlined, SearchOutlined } from '@ant-design/icons'
import { flowApi, type FlowDefinition } from '../../api/flow'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'

const flowTypeLabel: Record<string, string> = { APPROVAL: '审批流', COLLABORATION: '协同流' }

interface CreateFormValues {
  code: string
  name: string
  flow_type: 'APPROVAL' | 'COLLABORATION'
  description?: string
}

export default function FlowDefinitions() {
  const navigate = useNavigate()
  const hasPerm = usePermission()
  const [form] = Form.useForm<CreateFormValues>()
  const [data, setData] = useState<FlowDefinition[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = async (p = page, s = size, kw = keyword) => {
    setLoading(true)
    try {
      const res = await flowApi.listDefinitions({ page: p, size: s, keyword: kw })
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

  const handleSearch = () => {
    setPage(1)
    load(1, size, keyword)
  }

  const handleCreate = async () => {
    const values = await form.validateFields()
    setCreating(true)
    try {
      const r = await flowApi.createDefinition({
        code: values.code,
        name: values.name,
        flow_type: values.flow_type,
        description: values.description || '',
      })
      message.success('创建成功')
      setShowCreate(false)
      navigate(`/flow/designer/${r.id}`)
    } catch {
      // 拦截器已提示
    } finally {
      setCreating(false)
    }
  }

  const handlePublish = (d: FlowDefinition) => {
    Modal.confirm({
      title: '发布流程',
      content: `确认发布流程「${d.name}」？发布后流程定义不可再修改。`,
      okText: '发布',
      onOk: async () => {
        await flowApi.publishDefinition(d.id)
        message.success('发布成功')
        load()
      },
    })
  }

  const columns: ColumnsType<FlowDefinition> = [
    { title: '流程编码', dataIndex: 'code', key: 'code', width: 160 },
    { title: '流程名称', dataIndex: 'name', key: 'name' },
    {
      title: '流程类型',
      dataIndex: 'flow_type',
      key: 'flow_type',
      width: 110,
      render: (v: string) => flowTypeLabel[v] || v,
    },
    { title: '版本', dataIndex: 'version', key: 'version', width: 70, render: (v: number) => `v${v}` },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: number) =>
        v === 1 ? <Tag color="green">已发布</Tag> : v === 2 ? <Tag>已停用</Tag> : <Tag color="gold">草稿</Tag>,
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<BranchesOutlined />} onClick={() => navigate(`/flow/designer/${record.id}`)}>
            设计
          </Button>
          {record.status === 0 && hasPerm('flow:definition:publish') && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => handlePublish(record)}>
              发布
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <TableToolbar
        title="流程定义"
        total={total}
        extra={
          <Space wrap>
            <Input
              placeholder="编码 / 名称"
              allowClear
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
            />
            <Button icon={<SearchOutlined />} onClick={handleSearch}>
              查询
            </Button>
            {hasPerm('flow:definition:add') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setShowCreate(true) }}>
                新建流程
              </Button>
            )}
          </Space>
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
        title="新建流程定义"
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        onOk={handleCreate}
        okText="创建并设计"
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ flow_type: 'APPROVAL' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="流程编码" name="code" rules={[{ required: true, message: '请输入流程编码' }]}>
                <Input placeholder="如 CUSTOMER_APPROVAL" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="流程名称" name="name" rules={[{ required: true, message: '请输入流程名称' }]}>
                <Input placeholder="请输入流程名称" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="流程类型" name="flow_type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'APPROVAL', label: '审批流' },
                    { value: 'COLLABORATION', label: '协同流' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="描述" name="description">
                <Input.TextArea rows={2} placeholder="请输入描述" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}
