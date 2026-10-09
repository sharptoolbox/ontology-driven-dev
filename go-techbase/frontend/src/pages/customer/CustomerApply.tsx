import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { Button, Card, Col, Form, Input, Row, Select, Space, message } from 'antd'
import { ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { customerApi } from '../../api/customer'
import { metaApi, type DictItem } from '../../api/meta'
import { setAuth } from '../../store/slices/authSlice'
import { usePermission } from '../../hooks/usePermission'
import type { RootState, AppDispatch } from '../../store'
import { authApi } from '../../api/auth'
import { CustomerStatusPill } from '../../admin/components/StatusPill'

interface CustomerFormValues {
  customer_name: string
  customer_type: string
  customer_level: string
  industry?: string
  contact_person?: string
  contact_phone?: string
  address?: string
  remark?: string
}

/** 仅 草稿/已驳回(及新建)可编辑与提交 */
const EDITABLE_STATUS = ['草稿', '已驳回']

export default function CustomerApply() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((s: RootState) => s.auth.user)
  const hasPerm = usePermission()
  const [form] = Form.useForm<CustomerFormValues>()
  const [types, setTypes] = useState<DictItem[]>([])
  const [levels, setLevels] = useState<DictItem[]>([])
  const [status, setStatus] = useState('')
  const [customerNo, setCustomerNo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    metaApi
      .dictionaries()
      .then((d) => {
        setTypes(d.CUSTOMER_TYPE || [])
        setLevels(d.CUSTOMER_LEVEL || [])
      })
      .catch(() => {})
  }, [])

  // 兜底:直接刷新页面时 Redux 里可能还没有 user,先恢复登录态
  useEffect(() => {
    if (!user) {
      authApi
        .info()
        .then((info) => dispatch(setAuth({ info })))
        .catch(() => {})
    }
  }, [user, dispatch])

  useEffect(() => {
    if (!idParam) {
      setStatus('')
      setCustomerNo('')
      return
    }
    customerApi
      .get(Number(idParam))
      .then((c) => {
        setCustomerNo(c.customer_no)
        form.setFieldsValue({
          customer_name: c.customer_name,
          customer_type: c.customer_type,
          customer_level: c.customer_level,
          industry: c.industry || '',
          contact_person: c.contact_person || '',
          contact_phone: c.contact_phone || '',
          address: c.address || '',
          remark: c.remark || '',
        })
        setStatus(c.status)
      })
      .catch(() => {})
  }, [idParam, form])

  const editable = !idParam || EDITABLE_STATUS.includes(status)

  const draftBody = (values: CustomerFormValues) => ({
    customer_name: values.customer_name,
    customer_type: values.customer_type,
    customer_level: values.customer_level,
    industry: values.industry || '',
    contact_person: values.contact_person || '',
    contact_phone: values.contact_phone || '',
    address: values.address || '',
    remark: values.remark || '',
  })

  /** 暂存:有 ?id 走 PUT,否则 POST;返回客户 id */
  const saveDraft = async (): Promise<number | null> => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (idParam) {
        await customerApi.updateDraft(Number(idParam), draftBody(values))
        return Number(idParam)
      }
      const c = await customerApi.createDraft(draftBody(values))
      setSearchParams({ id: String(c.id) })
      return c.id
    } finally {
      setSaving(false)
    }
  }

  const handleDraft = async () => {
    try {
      await saveDraft()
      message.success('暂存成功')
      if (idParam) {
        const c = await customerApi.get(Number(idParam))
        setStatus(c.status)
        setCustomerNo(c.customer_no)
      }
    } catch {
      // 校验失败或接口报错(拦截器已提示)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const savedId = await saveDraft()
      if (!savedId) return
      const c = await customerApi.submit(savedId)
      setStatus(c.status)
      message.success('提交成功')
    } catch {
      // 拦截器已提示
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    form.resetFields()
    setStatus('')
    setSearchParams({})
  }

  return (
    <Card
      title="客户申请"
      extra={
        <Space>
          {status && <CustomerStatusPill status={status} />}
          <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={!editable}>
            重置
          </Button>
          {hasPerm('customer:save') && (
            <Button icon={<SaveOutlined />} loading={saving} onClick={handleDraft} disabled={!editable}>
              暂存
            </Button>
          )}
          {hasPerm('customer:submit') && (
            <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit} disabled={!editable}>
              提交
            </Button>
          )}
        </Space>
      }
    >
      <Form form={form} layout="vertical" disabled={!editable}>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="客户编号">
              <Input value={customerNo || '暂存后自动生成'} disabled readOnly />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="客户名称"
              name="customer_name"
              rules={[{ required: true, message: '请输入客户名称' }]}
            >
              <Input placeholder="请输入客户名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="客户类型"
              name="customer_type"
              rules={[{ required: true, message: '请选择客户类型' }]}
            >
              <Select
                placeholder="请选择"
                options={types.map((t) => ({ value: t.code, label: t.label }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="客户等级"
              name="customer_level"
              rules={[{ required: true, message: '请选择客户等级' }]}
            >
              <Select
                placeholder="请选择"
                options={levels.map((t) => ({ value: t.code, label: t.label }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="所属行业" name="industry">
              <Input placeholder="请输入所属行业" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="联系人" name="contact_person">
              <Input placeholder="请输入联系人" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="联系电话" name="contact_phone">
              <Input placeholder="请输入联系电话" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="客户地址" name="address">
              <Input placeholder="请输入客户地址" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="remark">
              <Input.TextArea rows={3} placeholder="请输入备注" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  )
}
