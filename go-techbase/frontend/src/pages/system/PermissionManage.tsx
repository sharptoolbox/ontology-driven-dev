import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { permissionApi, type Permission, type PermissionSaveBody } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'

interface FormValues {
  code: string
  name: string
  target_type: string
  target_ref: string
  data_scope: string
  abac_condition?: string
  status: number
}

const emptyForm: FormValues = {
  code: '',
  name: '',
  target_type: 'BEHAVIOR',
  target_ref: '',
  data_scope: 'ALL',
  abac_condition: '',
  status: 1,
}

export default function PermissionManage() {
  const hasPerm = usePermission()
  const [form] = Form.useForm<FormValues>()
  const [data, setData] = useState<Permission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Permission | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async (p = page, s = size, kw = keyword) => {
    setLoading(true)
    try {
      const res = await permissionApi.list({ page: p, size: s, keyword: kw })
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

  const openAdd = () => {
    setEditing(null)
    form.setFieldsValue({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (p: Permission) => {
    setEditing(p)
    form.setFieldsValue({
      code: p.code,
      name: p.name,
      target_type: p.target_type,
      target_ref: p.target_ref,
      data_scope: p.data_scope,
      abac_condition: p.abac_condition || '',
      status: p.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body: PermissionSaveBody = {
        code: values.code,
        name: values.name,
        target_type: values.target_type,
        target_ref: values.target_ref,
        data_scope: values.data_scope,
        abac_condition: values.abac_condition || '',
        status: values.status,
      }
      if (editing) {
        await permissionApi.update(editing.id, body)
        message.success('更新成功')
      } else {
        await permissionApi.create(body)
        message.success('创建成功')
      }
      setShowForm(false)
      load()
    } catch {
      // 校验失败或接口报错(拦截器已提示)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Permission) => {
    try {
      await permissionApi.remove(p.id)
      message.success('删除成功')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const columns: ColumnsType<Permission> = [
    { title: '权限编码', dataIndex: 'code', key: 'code', width: 200 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '目标类型', dataIndex: 'target_type', key: 'target_type', width: 100 },
    { title: '目标引用', dataIndex: 'target_ref', key: 'target_ref', width: 160 },
    { title: '数据范围', dataIndex: 'data_scope', key: 'data_scope', width: 100 },
    {
      title: 'ABAC 条件',
      dataIndex: 'abac_condition',
      key: 'abac_condition',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: number) => <Switch checked={v === 1} disabled size="small" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size={0}>
          {hasPerm('system:permission:edit') && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {hasPerm('system:permission:delete') && (
            <Popconfirm title={`确认删除权限「${record.code}」？`} onConfirm={() => handleDelete(record)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <TableToolbar
        title="权限管理"
        total={total}
        extra={
          <Space wrap>
            <Input
              placeholder="权限编码 / 名称"
              allowClear
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
            />
            <Button icon={<SearchOutlined />} onClick={handleSearch}>
              查询
            </Button>
            {hasPerm('system:permission:add') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                新增
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
        title={editing ? '编辑权限' : '新增权限'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={handleSave}
        confirmLoading={saving}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" initialValues={emptyForm}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="权限编码" name="code" rules={[{ required: true, message: '请输入权限编码' }]}>
                <Input placeholder="如 customer:save" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="权限名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="目标类型" name="target_type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'BEHAVIOR', label: '行为' },
                    { value: 'ENTITY', label: '实体' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="目标引用" name="target_ref" rules={[{ required: true, message: '请输入目标引用' }]}>
                <Input placeholder="目标引用" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="数据范围" name="data_scope" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'ALL', label: '全部' },
                    { value: 'OWN', label: '本人' },
                    { value: 'DEPT', label: '本部门' },
                    { value: 'CUSTOM', label: '自定义' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="状态" name="status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 1, label: '启用' },
                    { value: 0, label: '禁用' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="ABAC 条件"
                name="abac_condition"
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (getFieldValue('data_scope') !== 'CUSTOM' || (value && String(value).trim())) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('数据范围为自定义时必须填写 ABAC 条件'))
                    },
                  }),
                ]}
              >
                <Input.TextArea rows={2} placeholder="如 dept_id == user.dept_id" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}
