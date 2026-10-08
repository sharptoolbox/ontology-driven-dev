import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ApartmentOutlined, EditOutlined, PlusOutlined, SafetyOutlined, DeleteOutlined } from '@ant-design/icons'
import { roleApi, permissionApi, type SysRole, type Permission, type RoleSaveBody } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'

interface FormValues {
  name: string
  code: string
  parent_id: number
  description?: string
  status: number
}

const emptyForm: FormValues = { name: '', code: '', parent_id: 0, description: '', status: 1 }

export default function RoleManage() {
  const hasPerm = usePermission()
  const [form] = Form.useForm<FormValues>()
  const [data, setData] = useState<SysRole[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [allRoles, setAllRoles] = useState<SysRole[]>([])
  const [allPerms, setAllPerms] = useState<Permission[]>([])
  const [editing, setEditing] = useState<SysRole | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assignRole, setAssignRole] = useState<SysRole | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<number[]>([])
  const [assignSaving, setAssignSaving] = useState(false)

  const load = async (p = page, s = size, kw = keyword) => {
    setLoading(true)
    try {
      const res = await roleApi.list({ page: p, size: s, keyword: kw })
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

  useEffect(() => {
    roleApi
      .list({ page: 1, size: 50 })
      .then((r) => setAllRoles(r.list || []))
      .catch(() => {})
    permissionApi
      .all()
      .then(setAllPerms)
      .catch(() => setAllPerms([]))
  }, [])

  const handleSearch = () => {
    setPage(1)
    load(1, size, keyword)
  }

  const openAdd = () => {
    setEditing(null)
    form.setFieldsValue({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (r: SysRole) => {
    setEditing(r)
    form.setFieldsValue({
      name: r.name,
      code: r.code,
      parent_id: r.parent_id || 0,
      description: r.description || '',
      status: r.status,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        const body: RoleSaveBody = {
          name: values.name,
          parent_id: values.parent_id,
          description: values.description || '',
          status: values.status,
        }
        await roleApi.update(editing.id, body)
        message.success('更新成功')
      } else {
        await roleApi.create({
          name: values.name,
          code: values.code,
          parent_id: values.parent_id,
          description: values.description || '',
          status: values.status,
          permission_ids: [],
          resource_ids: [],
        })
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

  const handleDelete = async (r: SysRole) => {
    try {
      await roleApi.remove(r.id)
      message.success('删除成功')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const openAssign = (r: SysRole) => {
    setAssignRole(r)
    setSelectedPerms(r.permissions || [])
  }

  const handleAssign = async () => {
    if (!assignRole) return
    setAssignSaving(true)
    try {
      await roleApi.assignPermissions(assignRole.id, selectedPerms)
      message.success('权限已更新')
      setAssignRole(null)
      load()
    } catch {
      // 拦截器已提示
    } finally {
      setAssignSaving(false)
    }
  }

  const roleName = (id: number) => allRoles.find((x) => x.id === id)?.name

  const columns: ColumnsType<SysRole> = [
    { title: '角色名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '编码', dataIndex: 'code', key: 'code', width: 150 },
    {
      title: '父角色',
      dataIndex: 'parent_id',
      key: 'parent_id',
      width: 130,
      render: (v: number) => (v ? roleName(v) || v : '-'),
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v) => v || '-' },
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
      width: 240,
      render: (_, record) => (
        <Space size={0}>
          {hasPerm('system:role:edit') && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {hasPerm('system:role:assign') && (
            <Button type="link" size="small" icon={<SafetyOutlined />} onClick={() => openAssign(record)}>
              分配权限
            </Button>
          )}
          {hasPerm('system:role:delete') && record.code !== 'admin' && (
            <Popconfirm title={`确认删除角色「${record.name}」？`} onConfirm={() => handleDelete(record)}>
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
        title="角色管理"
        total={total}
        extra={
          <Space wrap>
            <Input
              placeholder="角色名称 / 编码"
              allowClear
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
            />
            <Button icon={<ApartmentOutlined />} onClick={handleSearch}>
              查询
            </Button>
            {hasPerm('system:role:add') && (
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
        title={editing ? '编辑角色' : '新增角色'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={handleSave}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={emptyForm}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请输入角色名称' }]}>
                <Input placeholder="角色名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="编码"
                name="code"
                rules={[{ required: true, message: '请输入编码' }]}
                extra={editing ? '角色编码不可修改' : undefined}
              >
                <Input placeholder="角色编码" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="父角色" name="parent_id">
                <Select
                  allowClear
                  options={[
                    { value: 0, label: '无(顶级)' },
                    ...allRoles
                      .filter((r) => r.id !== editing?.id)
                      .map((r) => ({ value: r.id, label: r.name })),
                  ]}
                  onChange={(v) => form.setFieldValue('parent_id', v ?? 0)}
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
              <Form.Item label="描述" name="description">
                <Input.TextArea rows={2} placeholder="角色描述" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={`分配权限:${assignRole?.name || ''}`}
        open={!!assignRole}
        onClose={() => setAssignRole(null)}
        width={480}
        extra={
          <Button type="primary" loading={assignSaving} onClick={handleAssign}>
            保存
          </Button>
        }
      >
        <Tag color="blue" style={{ marginBottom: 12 }}>{`已选 ${selectedPerms.length} 项`}</Tag>
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          value={selectedPerms}
          onChange={(v) => setSelectedPerms(v as number[])}
        >
          {allPerms.map((p) => (
            <Checkbox key={p.id} value={p.id}>
              {p.name}（{p.code}）
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Drawer>
    </Card>
  )
}
