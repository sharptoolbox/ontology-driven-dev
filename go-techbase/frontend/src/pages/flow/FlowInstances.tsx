import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
  Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons'
import { flowApi, type FlowInstance, type FlowInstanceDetail } from '../../api/flow'
import { usePermission } from '../../hooks/usePermission'
import TableToolbar from '../../admin/components/TableToolbar'
import { InstanceStatusPill } from '../../admin/components/StatusPill'
import dayjs from 'dayjs'

const INSTANCE_STATUSES = ['RUNNING', 'APPROVED', 'REJECTED', 'TERMINATED']

const statusTag = (s: string) => <InstanceStatusPill status={s} />

const actionLabel: Record<string, string> = {
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  SUBMIT: '提交',
  START: '发起',
  TERMINATE: '终止',
  CREATE: '创建',
}

const fmt = (v?: string | null) => {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : v
}

export default function FlowInstances() {
  const hasPerm = usePermission()
  const [data, setData] = useState<FlowInstance[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [status, setStatus] = useState<string | undefined>()
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<FlowInstanceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = async (p = page, s = size) => {
    setLoading(true)
    try {
      const res = await flowApi.listInstances({ page: p, size: s, status, keyword })
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
    load(1, size)
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const d = await flowApi.getInstance(id)
      setDetail(d)
    } catch {
      // 拦截器已提示
    } finally {
      setDetailLoading(false)
    }
  }

  const handleTerminate = async (id: number) => {
    try {
      await flowApi.terminateInstance(id)
      message.success('已终止')
      load()
    } catch {
      // 拦截器已提示
    }
  }

  const columns: ColumnsType<FlowInstance> = [
    { title: '流程名称', dataIndex: 'def_name', key: 'def_name', render: (v) => v || '-' },
    { title: '流程编码', dataIndex: 'def_code', key: 'def_code', width: 160, render: (v) => v || '-' },
    { title: '业务单号', dataIndex: 'business_key', key: 'business_key', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => statusTag(v) },
    { title: '发起时间', dataIndex: 'started_at', key: 'started_at', width: 170, render: fmt },
    { title: '结束时间', dataIndex: 'ended_at', key: 'ended_at', width: 170, render: fmt },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
            详情
          </Button>
          {record.status === 'RUNNING' && hasPerm('flow:instance:terminate') && (
            <Popconfirm title="确认强制终止该流程实例？" onConfirm={() => handleTerminate(record.id)}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>
                终止
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const taskColumns: ColumnsType<NonNullable<FlowInstanceDetail['tasks']>[number]> = [
    { title: '节点', dataIndex: 'activity_name', key: 'activity_name' },
    { title: '办理人', dataIndex: 'assignee_name', key: 'assignee_name', render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
    { title: '动作', dataIndex: 'action', key: 'action', width: 90, render: (v: string | null) => (v ? actionLabel[v] || v : '-') },
    { title: '办理时间', dataIndex: 'done_at', key: 'done_at', width: 160, render: fmt },
  ]

  return (
    <Card>
      <TableToolbar title="流程实例" total={total} />
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 160 }}
          value={status}
          onChange={(v) => setStatus(v)}
          options={INSTANCE_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Input
          placeholder="业务单号"
          allowClear
          style={{ width: 200 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
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

      <Drawer
        title="流程实例详情"
        open={!!detail}
        onClose={() => setDetail(null)}
        width={680}
        loading={detailLoading}
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="流程">{detail.definition?.name || detail.def_name}</Descriptions.Item>
              <Descriptions.Item label="流程编码">{detail.definition?.code || detail.def_code}</Descriptions.Item>
              <Descriptions.Item label="业务单号">{detail.business_key}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="发起时间">{fmt(detail.started_at)}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{fmt(detail.ended_at)}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ margin: '16px 0 8px' }}>
              任务
            </Typography.Title>
            <Table
              rowKey="id"
              size="small"
              columns={taskColumns}
              dataSource={detail.tasks || []}
              pagination={false}
            />

            <Typography.Title level={5} style={{ margin: '16px 0 8px' }}>
              审批历史
            </Typography.Title>
            {(detail.history || []).length === 0 ? (
              <Tag>暂无历史</Tag>
            ) : (
              <Timeline
                items={(detail.history || []).map((h) => ({
                  children: (
                    <div>
                      <div>
                        <Typography.Text strong>{h.activity_name || '-'}</Typography.Text>{' '}
                        <Tag>{actionLabel[h.action] || h.action}</Tag>
                        <Typography.Text type="secondary">{h.operator_name || '-'}</Typography.Text>
                      </div>
                      {h.comment && <div style={{ color: '#888' }}>意见:{h.comment}</div>}
                      <div style={{ color: '#aaa', fontSize: 12 }}>{fmt(h.created_at)}</div>
                    </div>
                  ),
                }))}
              />
            )}
          </>
        )}
      </Drawer>
    </Card>
  )
}
