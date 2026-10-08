import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { adminConsoleApi, type NoticeRow } from '../../api/adminconsole'

export default function NoticeManage() {
  const [rows, setRows] = useState<NoticeRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState(0)
  const [form] = Form.useForm()

  const load = (p: number) => {
    setLoading(true)
    adminConsoleApi
      .noticeList(p, 15)
      .then((r) => {
        setRows(r.list ?? [])
        setTotal(r.total)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load(1)
  }, [])

  const openForm = (row?: NoticeRow) => {
    setEditId(row?.id ?? 0)
    form.setFieldsValue(row ?? { title: '', content: '', status: 1 })
    setOpen(true)
  }
  const save = async () => {
    const v = await form.validateFields()
    await adminConsoleApi.noticeSave(editId, v)
    message.success('已保存')
    setOpen(false)
    load(page)
  }

  const columns: ColumnsType<NoticeRow> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '标题', dataIndex: 'title' },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: number) => (v === 1 ? <Tag color="green">已发布</Tag> : <Tag>下线</Tag>) },
    { title: '发布人', dataIndex: 'created_by_name', width: 110 },
    { title: '更新时间', dataIndex: 'updated_at', width: 180 },
    {
      title: '操作',
      width: 130,
      render: (_: unknown, row: NoticeRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(row)} />
          <Popconfirm title="确认删除？" onConfirm={async () => { await adminConsoleApi.noticeDelete(row.id); message.success('已删除'); load(page) }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 20 }}>
      <Space style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>公告管理</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
          新建公告
        </Button>
      </Space>
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows}
        pagination={{ current: page, pageSize: 15, total, onChange: (p) => { setPage(p); load(p) } }} />
      <Modal title={editId ? '编辑公告' : '新建公告'} open={open} onOk={save} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Select options={[{ value: 1, label: '已发布' }, { value: 0, label: '下线' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
