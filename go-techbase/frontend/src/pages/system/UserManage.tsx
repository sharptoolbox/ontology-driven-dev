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
  Table,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, KeyOutlined, PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { userApi, type SysUser, type UserSaveBody } from '../../api/system'
import { roleApi, type SysRole } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'
import { EnableStatusPill } from '../../admin/components/StatusPill'

interface FormValues {
  username?: string
  password?: string
  real_name?: string
  email?: string
  phone?: string
  actor_type: string
  department_id?: number | null
  status: number
  role_ids: number[]
}

const emptyForm: FormValues = {
  username: '',
  password: '',
  real_name: '',
  email: '',
  phone: '',
  actor_type: 'HUMAN',
  department_id: null,
  status: 1,
  role_ids: [],
}

export default function UserManage() {
  const hasPerm = usePermission()
  const [form] = Form.useForm<FormValues>()
  const [pwdForm] = Form.useForm<{ new_password: string }>()
  const [data, setData] = useState<SysUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [roleOptions, setRoleOptions] = useState<SysRole[]>([])
  const [editing, setEditing] = useState<SysUser | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pwdUser, setPwdUser] = useState<SysUser | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  const load = async (p = page, s = size, kw = keyword) => {
    setLoading(true)
    try {
      const res = await userApi.list({ page: p, size: s, keyword: kw })
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
      .then((r) => setRoleOptions(r.list || []))
      .catch(() => {})
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

  const openEdit = (u: SysUser) => {
    setEditing(u)
    form.setFieldsValue({
      username: u.username,
      password: '',
      real_name: u.real_name || '',
      email: u.email || '',
      phone: u.phone || '',
      actor_type: u.actor_type,
      department_id: u.department_id,
      status: u.status,
      role_ids: u.roles.map((r) => r.id),
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        const body: UserSaveBody = {
          real_name: values.real_name,
          email: values.email,
          phone: values.phone,
          actor_type: values.actor_type,
          department_id: values.department_id ?? null,
          status: values.status,
          role_ids: values.role_ids,
        }
        await userApi.update(editing.id, body)
        message.success('更新成功')
      } else {
        await userApi.create({
          username: values.username,
          password: values.password,
          real_name: values.real_name,
          email: values.email,
          phone: values.phone,
          actor_type: values.actor_type,
          department_id: values.department_id ?? null,
          status: values.status,
          role_ids: values.role_ids,
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

  const handleDelete = async (u: SysUser) => {
    try {
      await userApi.remove(u.id)
      message.success('删除成功')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const handleResetPwd = async () => {
    if (!pwdUser) return
    const values = await pwdForm.validateFields()
    setPwdSaving(true)
    try {
      await userApi.resetPwd(pwdUser.id, values.new_password)
      message.success('密码已重置')
      setPwdUser(null)
      pwdForm.resetFields()
    } catch {
      // 拦截器已提示
    } finally {
      setPwdSaving(false)
    }
  }

  const isAdminUser = (u: SysUser) => u.username === 'admin' || u.roles.some((r) => r.code === 'admin')

  const columns: ColumnsType<SysUser> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '姓名', dataIndex: 'real_name', key: 'real_name', width: 110, render: (v) => v || '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130, render: (v) => v || '-' },
    { title: '类型', dataIndex: 'actor_type', key: 'actor_type', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: number) => <EnableStatusPill value={v} />,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: SysUser['roles']) =>
        roles && roles.length > 0 ? roles.map((r) => <Tag key={r.id} color="blue">{r.name}</Tag>) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 230,
      render: (_, record) => (
        <Space size={0}>
          {hasPerm('system:user:edit') && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {hasPerm('system:user:reset-pwd') && (
            <Button
              type="link"
              size="small"
              icon={<KeyOutlined />}
              onClick={() => {
                setPwdUser(record)
                pwdForm.resetFields()
              }}
            >
              重置密码
            </Button>
          )}
          {hasPerm('system:user:delete') && !isAdminUser(record) && (
            <Popconfirm title={`确认删除用户「${record.username}」？`} onConfirm={() => handleDelete(record)}>
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
        title="用户管理"
        total={total}
        extra={
          <Space wrap>
            <Input
              placeholder="用户名 / 姓名 / 手机号"
              allowClear
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
            />
            <Button icon={<SearchOutlined />} onClick={handleSearch}>
              查询
            </Button>
            {hasPerm('system:user:add') && (
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
        title={editing ? '编辑用户' : '新增用户'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={handleSave}
        confirmLoading={saving}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" initialValues={emptyForm}>
          <Row gutter={16}>
            {!editing && (
              <>
                <Col span={12}>
                  <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input placeholder="登录用户名" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="初始密码" name="password" rules={[{ required: true, message: '请输入初始密码' }]}>
                    <Input.Password placeholder="初始密码" />
                  </Form.Item>
                </Col>
              </>
            )}
            <Col span={12}>
              <Form.Item label="姓名" name="real_name">
                <Input placeholder="真实姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="邮箱" name="email">
                <Input placeholder="邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="手机号" name="phone">
                <Input placeholder="手机号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="账户类型" name="actor_type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'HUMAN', label: '人工账户' },
                    { value: 'SYSTEM', label: '系统账户' },
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
              <Form.Item label="分配角色" name="role_ids">
                <Select
                  mode="multiple"
                  placeholder="选择角色"
                  allowClear
                  options={roleOptions.map((r) => ({ value: r.id, label: r.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`重置密码:${pwdUser?.username || ''}`}
        open={!!pwdUser}
        onOk={handleResetPwd}
        onCancel={() => setPwdUser(null)}
        confirmLoading={pwdSaving}
        destroyOnHidden
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item
            label="新密码"
            name="new_password"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
