import { useEffect, useState } from 'react'
import { Button, Card, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, SwapOutlined, BellOutlined } from '@ant-design/icons'
import { flowApi, type FlowTask } from '../../api/flow'
import { userApi, type SysUser } from '../../api/system'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'
import { TaskStatusPill } from '../../admin/components/StatusPill'
import dayjs from 'dayjs'

const TASK_STATUSES = ['TODO', 'DONE', 'CANCEL']

const statusTag = (s: string) => <TaskStatusPill status={s} />

const actionLabel: Record<string, string> = {
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  SUBMIT: '提交',
}

const fmt = (v?: string | null) => {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : v
}

export default function FlowTasks() {
  const hasPerm = usePermission()
  const [data, setData] = useState<FlowTask[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [status, setStatus] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const [transferTarget, setTransferTarget] = useState<FlowTask | null>(null)
  const [users, setUsers] = useState<SysUser[]>([])
  const [assigneeId, setAssigneeId] = useState<number | undefined>()
  const [transferring, setTransferring] = useState(false)

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const res = await flowApi.listTasks({ page: p, size: s, status })
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

  // 转办目标用户:GET /api/users?page=1&size=50
  const openTransfer = (t: FlowTask) => {
    setTransferTarget(t)
    setAssigneeId(undefined)
    if (users.length === 0) {
      userApi
        .list({ page: 1, size: 50 })
        .then((r) => setUsers(r.list || []))
        .catch(() => {})
    }
  }

  const handleTransfer = async () => {
    if (!transferTarget || !assigneeId) {
      message.warning('请选择目标用户')
      return
    }
    setTransferring(true)
    try {
      await flowApi.transferTask(transferTarget.id, assigneeId)
      message.success('转办成功')
      setTransferTarget(null)
      load()
    } catch {
      // 拦截器已提示
    } finally {
      setTransferring(false)
    }
  }

  const handleUrge = async (t: FlowTask) => {
    try {
      await flowApi.urgeTask(t.id)
      message.success('催办成功')
    } catch {
      // 拦截器已提示
    }
  }

  const columns: ColumnsType<FlowTask> = [
    { title: '业务单号', dataIndex: 'business_key', key: 'business_key', width: 160, render: (v) => v || '-' },
    { title: '任务节点', dataIndex: 'activity_name', key: 'activity_name' },
    { title: '办理人', dataIndex: 'assignee_name', key: 'assignee_name', width: 110, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => statusTag(v) },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (v: string | null) => (v ? actionLabel[v] || v : '-'),
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: fmt },
    {
      title: '操作',
      key: 'action_op',
      width: 160,
      render: (_, record) =>
        record.status === 'TODO' ? (
          <Space>
            {hasPerm('flow:task:transfer') && (
              <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => openTransfer(record)}>
                转办
              </Button>
            )}
            {hasPerm('flow:task:urge') && (
              <Button type="link" size="small" icon={<BellOutlined />} onClick={() => handleUrge(record)}>
                催办
              </Button>
            )}
          </Space>
        ) : null,
    },
  ]

  return (
    <Card>
      <TableToolbar title="任务管理" total={total} />
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 160 }}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); load(1, size) }}>
          查询
        </Button>
      </Space>
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
        title={`转办:${transferTarget?.activity_name || ''}`}
        open={!!transferTarget}
        onOk={handleTransfer}
        onCancel={() => setTransferTarget(null)}
        confirmLoading={transferring}
        okText="确认转办"
        destroyOnHidden
      >
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="选择转办目标用户"
          value={assigneeId}
          onChange={setAssigneeId}
          optionFilterProp="label"
          options={users.map((u) => ({
            value: u.id,
            label: u.real_name ? `${u.real_name}（${u.username}）` : u.username,
          }))}
        />
      </Modal>
    </Card>
  )
}
