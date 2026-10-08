import { useEffect, useMemo, useState } from 'react'
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
  TreeSelect,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { resourceApi, type ResourceType, type SysResource, type ResourceSaveBody } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'

const typeLabel: Record<string, string> = {
  DIRECTORY: '目录',
  MENU: '菜单',
  BUTTON: '按钮',
  API: '接口',
}

interface FormValues {
  parent_id: number
  type: ResourceType
  name: string
  code: string
  permission_code?: string
  path?: string
  component?: string
  icon?: string
  http_method?: string
  sort_order: number
  status: number
}

const emptyForm: FormValues = {
  parent_id: 0,
  type: 'MENU',
  name: '',
  code: '',
  permission_code: '',
  path: '',
  component: '',
  icon: '',
  http_method: 'GET',
  sort_order: 0,
  status: 1,
}

export default function ResourceManage() {
  const hasPerm = usePermission()
  const [form] = Form.useForm<FormValues>()
  const [tree, setTree] = useState<SysResource[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<SysResource | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const t = await resourceApi.tree()
      setTree(t || [])
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** 去掉空 children,避免表格出现多余展开图标 */
  const cleanTree = (nodes: SysResource[]): SysResource[] =>
    nodes.map((n) => {
      const next = { ...n }
      if (next.children && next.children.length > 0) {
        next.children = cleanTree(next.children)
      } else {
        delete next.children
      }
      return next
    })

  const tableData = useMemo(() => cleanTree(tree), [tree])

  /** 父资源 TreeSelect 数据 */
  const parentOptions = useMemo(() => {
    const build = (nodes: SysResource[]): any[] =>
      nodes.map((n) => ({ title: n.name, value: n.id, children: n.children ? build(n.children) : [] }))
    return [{ title: '无(根资源)', value: 0, children: build(tree) }]
  }, [tree])

  const openAddRoot = () => {
    setEditing(null)
    form.setFieldsValue({ ...emptyForm, parent_id: 0 })
    setShowForm(true)
  }

  const openAddChild = (parent: SysResource) => {
    setEditing(null)
    form.setFieldsValue({ ...emptyForm, parent_id: parent.id })
    setShowForm(true)
  }

  const openEdit = (r: SysResource) => {
    setEditing(r)
    form.setFieldsValue({
      parent_id: r.parent_id || 0,
      type: r.type,
      name: r.name,
      code: r.code,
      permission_code: r.permission_code || '',
      path: r.path || '',
      component: r.component || '',
      icon: r.icon || '',
      http_method: r.http_method || 'GET',
      sort_order: r.sort_order,
      status: r.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    // 前端校验:MENU 必填 path,BUTTON/API 必填 permission_code
    if (values.type === 'MENU' && !values.path?.trim()) {
      message.warning('类型为菜单(MENU)时,路径 path 必填')
      return
    }
    if ((values.type === 'BUTTON' || values.type === 'API') && !values.permission_code?.trim()) {
      message.warning('类型为按钮(BUTTON)/接口(API)时,权限标识 permission_code 必填')
      return
    }
    setSaving(true)
    try {
      const body: ResourceSaveBody = {
        parent_id: values.parent_id ?? 0,
        name: values.name,
        code: values.code,
        permission_code: values.permission_code || '',
        type: values.type,
        path: values.path || '',
        component: values.component || '',
        icon: values.icon || '',
        http_method: values.http_method || '',
        sort_order: Number(values.sort_order) || 0,
        status: values.status,
      }
      if (editing) {
        await resourceApi.update(editing.id, body)
        message.success('资源已更新')
      } else {
        await resourceApi.create(body)
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

  const handleDelete = async (r: SysResource) => {
    try {
      await resourceApi.remove(r.id)
      message.success('删除成功')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const columns: ColumnsType<SysResource> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 200 },
    { title: '编码', dataIndex: 'code', key: 'code', width: 180 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (v: string) => typeLabel[v] || v,
    },
    { title: '路径', dataIndex: 'path', key: 'path', width: 160, render: (v) => v || '-' },
    { title: '权限标识', dataIndex: 'permission_code', key: 'permission_code', render: (v) => v || '-' },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 70 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: number) => <Switch checked={v === 1} disabled size="small" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size={0}>
          {hasPerm('system:resource:add') && (
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openAddChild(record)}>
              子级
            </Button>
          )}
          {hasPerm('system:resource:edit') && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {hasPerm('system:resource:delete') && (
            <Popconfirm
              title={`确认删除资源「${record.name}」及其子资源？`}
              onConfirm={() => handleDelete(record)}
            >
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
        title="资源管理(菜单 / 按钮 / 接口)"
        extra={
          hasPerm('system:resource:add') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddRoot}>
              新增根资源
            </Button>
          )
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={false}
        expandable={{ defaultExpandAllRows: true }}
      />

      <Modal
        title={editing ? '编辑资源' : '新增资源'}
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
              <Form.Item label="父资源" name="parent_id">
                <TreeSelect
                  treeData={parentOptions}
                  treeDefaultExpandAll
                  placeholder="选择父资源"
                  allowClear={false}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'DIRECTORY', label: '目录' },
                    { value: 'MENU', label: '菜单' },
                    { value: 'BUTTON', label: '按钮' },
                    { value: 'API', label: '接口' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="资源名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="编码" name="code" rules={[{ required: true, message: '请输入编码' }]}>
                <Input placeholder="资源编码" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="权限标识"
                name="permission_code"
                dependencies={['type']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const t = getFieldValue('type')
                      if ((t === 'BUTTON' || t === 'API') && !value?.trim()) {
                        return Promise.reject(new Error('BUTTON/API 类型必须填写权限标识'))
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <Input placeholder="如 system:user:add" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="路径"
                name="path"
                dependencies={['type']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (getFieldValue('type') === 'MENU' && !value?.trim()) {
                        return Promise.reject(new Error('MENU 类型必须填写路径'))
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <Input placeholder="如 /system/users" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="图标" name="icon">
                <Input placeholder="图标名(如 Users)" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="HTTP 方法" name="http_method">
                <Select
                  allowClear
                  placeholder="接口类型选择"
                  options={['GET', 'POST', 'PUT', 'DELETE'].map((m) => ({ value: m, label: m }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="组件" name="component">
                <Input placeholder="前端组件路径" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="排序" name="sort_order">
                <Input type="number" placeholder="排序号" />
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
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}
