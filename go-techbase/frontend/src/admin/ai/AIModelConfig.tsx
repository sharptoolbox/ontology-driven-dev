import { useCallback, useEffect, useState } from 'react'
import { Button, Collapse, Input, InputNumber, message, Popconfirm, Select, Switch, Tabs, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { http } from '../../api/request'

// 模型设置页（管理控制台）—— 多供应商账号管理（用户规则 2026-10，对齐附图形态）：
// 账号卡片（名称+状态绿点+编辑/删除）+ 添加表单（第三方模型提供商/自定义模型 API 两个 tab，
// 自定义设置折叠：API 地址、模型目录【获取可用模型/添加模型】、默认模型、温度）。
// 存储 ai_provider_account 多行表；api_key 回显打码，留空=保留旧值。
interface Account {
  id: number
  name: string
  provider: string
  base_url: string
  api_key?: string
  models: string
  default_model: string
  temperature: number
  enabled: boolean
  has_key: boolean
}

interface CatalogItem {
  key: string
  label: string
  base_url: string
  models: string
}

const EMPTY: Partial<Account> = { provider: 'zai', base_url: '', models: '', default_model: '', temperature: 0.3, enabled: true }

export default function AIModelConfigPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [testing, setTesting] = useState<Record<number, boolean>>({})
  const [testOk, setTestOk] = useState<Record<number, boolean | undefined>>({})

  // 编辑态：null=只读列表；Partial<Account>+isNew=表单
  const [editing, setEditing] = useState<Partial<Account> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mode, setMode] = useState<'catalog' | 'custom'>('catalog')
  const [saving, setSaving] = useState(false)
  const [upstreamLoading, setUpstreamLoading] = useState(false)
  const [newModel, setNewModel] = useState('')

  const load = useCallback(() => {
    http.get<{ accounts: Account[] }>('/api/admin/ai/accounts').then((d) => setAccounts(d.accounts || [])).catch(() => {})
    http.get<{ catalog: CatalogItem[] }>('/api/admin/ai/catalog').then((d) => setCatalog(d.catalog || [])).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const catalogOf = (key: string) => catalog.find((c) => c.key === key)

  const startCreate = () => {
    setEditing({ ...EMPTY })
    setIsNew(true)
    setMode('catalog')
    setNewModel('')
  }

  const startEdit = (a: Account) => {
    setEditing({ ...a })
    setIsNew(false)
    setMode(a.provider === 'custom' ? 'custom' : 'catalog')
    setNewModel('')
  }

  const save = async () => {
    if (!editing) return
    if (!editing.name?.trim()) {
      message.warning('请填写账号名称')
      return
    }
    setSaving(true)
    try {
      const payload = { ...editing }
      if (mode === 'catalog' && editing.provider !== 'custom') {
        payload.base_url = payload.base_url || '' // 空=提供商默认
      }
      if (isNew) {
        await http.post('/api/admin/ai/accounts', payload)
      } else {
        await http.put(`/api/admin/ai/accounts/${editing.id}`, payload)
      }
      message.success('已保存')
      setEditing(null)
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await http.del(`/api/admin/ai/accounts/${id}`)
      message.success('已删除')
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const test = async (id: number) => {
    setTesting((t) => ({ ...t, [id]: true }))
    try {
      const r = await http.post<{ ok: boolean; error?: string }>(`/api/admin/ai/accounts/${id}/test`, {})
      setTestOk((m) => ({ ...m, [id]: r.ok }))
      if (r.ok) message.success(`${accounts.find((a) => a.id === id)?.name || '账号'} 连接正常`)
      else message.warning(r.error || '连接失败')
    } catch (e) {
      setTestOk((m) => ({ ...m, [id]: false }))
      message.error(e instanceof Error ? e.message : '测试失败')
    } finally {
      setTesting((t) => ({ ...t, [id]: false }))
    }
  }

  const fetchUpstream = async () => {
    if (!editing) return
    setUpstreamLoading(true)
    try {
      const q = new URLSearchParams()
      if (!isNew && editing.id) q.set('id', String(editing.id))
      if (editing.base_url) q.set('base_url', editing.base_url)
      // 编辑中密钥未回显：仅已保存账号可用 id 取存档密钥；表单态新账号需先保存
      const r = await http.get<{ models: string[] | null; error?: string }>(`/api/admin/ai/upstream-models?${q}`)
      if (r.models?.length) {
        setEditing({ ...editing, models: r.models.join(','), default_model: editing.default_model || r.models[0] })
        message.success(`获取到 ${r.models.length} 个可用模型`)
      } else {
        message.warning(r.error || '未获取到模型目录')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '获取失败')
    } finally {
      setUpstreamLoading(false)
    }
  }

  const modelList = (editing?.models || '').split(',').map((s) => s.trim()).filter(Boolean)

  const patch = (kv: Partial<Account>) => setEditing((e) => (e ? { ...e, ...kv } : e))

  // ── 表单卡片（第三方/自定义 两 tab + 自定义设置折叠）──
  const editorCard = editing && (
    <div style={{ background: '#f7f8fa', borderRadius: 14, padding: 16, marginTop: 12 }}>
      <Tabs
        activeKey={mode}
        onChange={(k) => {
          setMode(k as 'catalog' | 'custom')
          patch({ provider: k === 'custom' ? 'custom' : editing.provider === 'custom' ? 'zai' : editing.provider })
        }}
        items={[
          { key: 'catalog', label: '第三方模型提供商' },
          { key: 'custom', label: '自定义模型 API' },
        ]}
      />
      {mode === 'catalog' && (
        <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>
          从内置目录中选择 OpenAI、Anthropic、Kimi 等提供商，填入其 API 密钥即可使用。
        </p>
      )}
      {mode === 'custom' && (
        <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>
          自行填写 OpenAI 兼容端点与密钥（vllm/one-api/企业网关等）。
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>账号名称</div>
          <Input
            value={editing.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={mode === 'custom' ? '如 my-gateway' : '如 zai-coding-cn'}
          />
        </div>
        {mode === 'catalog' ? (
          <div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>提供商</div>
            <Select
              style={{ width: '100%' }}
              value={editing.provider === 'custom' ? 'zai' : editing.provider}
              onChange={(v) => patch({ provider: v, base_url: '', models: catalogOf(v)?.models || '', default_model: '' })}
              options={catalog.filter((c) => c.key !== 'custom').map((c) => ({ value: c.key, label: c.label }))}
            />
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>协议</div>
            <Input value="OpenAI 兼容" disabled />
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
          API 密钥{!isNew && editing.has_key ? '（已配置，留空=保留旧值）' : ''}
        </div>
        <Input.Password
          value={editing.api_key || ''}
          onChange={(e) => patch({ api_key: e.target.value })}
          placeholder="输入 API 密钥，或留空使用环境认证"
          autoComplete="new-password"
        />
      </div>

      <Collapse
        ghost
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'custom-settings',
            label: <b style={{ fontSize: 13 }}>自定义设置</b>,
            children: (
              <>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>API 地址</div>
                <Input
                  value={editing.base_url}
                  onChange={(e) => patch({ base_url: e.target.value })}
                  placeholder={
                    mode === 'catalog'
                      ? catalogOf(editing.provider || '')?.base_url || '提供商默认'
                      : '如 https://gw.example.com/v1'
                  }
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>模型目录</div>
                  <Button type="link" size="small" loading={upstreamLoading} onClick={fetchUpstream}>
                    获取可用模型
                  </Button>
                </div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
                  {modelList.length ? `已配置 ${modelList.length} 个模型` : '正在使用适配器默认模型'}
                </div>
                <div style={{ border: '1px dashed #d9d9d9', borderRadius: 10, padding: 10, minHeight: 44 }}>
                  {modelList.length === 0 ? (
                    <div style={{ color: '#bbb', fontSize: 12, textAlign: 'center', padding: 6 }}>
                      模型选择器中将不显示任何模型；目录外 ID 仍可直接发送。
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {modelList.map((m) => (
                        <Tag
                          key={m}
                          closable
                          onClose={() =>
                            patch({ models: modelList.filter((x) => x !== m).join(',') })
                          }
                        >
                          {m}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Input
                    size="small"
                    style={{ maxWidth: 280 }}
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="输入模型 ID，如 glm-4.7"
                    onPressEnter={() => {
                      const m = newModel.trim()
                      if (m && !modelList.includes(m)) patch({ models: [...modelList, m].join(',') })
                      setNewModel('')
                    }}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const m = newModel.trim()
                      if (m && !modelList.includes(m)) patch({ models: [...modelList, m].join(',') })
                      setNewModel('')
                    }}
                  >
                    添加模型
                  </Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>默认模型</div>
                    <Select
                      style={{ width: '100%' }}
                      value={editing.default_model || undefined}
                      onChange={(v) => patch({ default_model: v })}
                      placeholder={modelList[0] || '目录第一个'}
                      allowClear
                      options={modelList.map((m) => ({ value: m, label: m }))}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Temperature（0=模型默认）</div>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      max={2}
                      step={0.1}
                      value={editing.temperature}
                      onChange={(v) => patch({ temperature: v ?? 0 })}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch checked={editing.enabled !== false} onChange={(v) => patch({ enabled: v })} />
                  <span style={{ fontSize: 13, color: '#555' }}>启用（关闭后不出现在 AI 助理模型选择器）</span>
                </div>
              </>
            ),
          },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        <Button onClick={() => setEditing(null)}>取消</Button>
        <Button type="primary" loading={saving} onClick={save} style={{ minWidth: 88 }}>
          保存
        </Button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>
      <h3 style={{ marginBottom: 4 }}>模型</h3>
      <p style={{ color: '#888', fontSize: 13 }}>
        填入各提供商的 API 密钥即可使用其模型。AI 助理（工作台/控制台）可在模型选择器中切换。
      </p>

      {accounts.map((a) => (
        <div
          key={a.id}
          style={{
            border: '1px solid #ececec', borderRadius: 14, padding: '14px 18px', marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
            {testOk[a.id] !== undefined && (
              <span
                title={testOk[a.id] ? '连接正常' : '连接失败'}
                style={{
                  width: 8, height: 8, borderRadius: 999, display: 'inline-block',
                  background: testOk[a.id] ? '#22c55e' : '#d4d4d8',
                }}
              />
            )}
            {!a.enabled && <Tag style={{ marginLeft: 4 }}>已停用</Tag>}
            {!a.has_key && <Tag color="warning" style={{ marginLeft: 4 }}>未配密钥</Tag>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button size="small" icon={<ReloadOutlined />} loading={!!testing[a.id]} onClick={() => test(a.id)}>
              测试
            </Button>
            <Button size="small" onClick={() => startEdit(a)}>编辑</Button>
            <Popconfirm title="确认删除该账号？" onConfirm={() => remove(a.id)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>
      ))}

      {!editing && (
        <Button icon={<PlusOutlined />} onClick={startCreate} style={{ marginTop: 4 }}>
          添加账号
        </Button>
      )}
      {editorCard}
    </div>
  )
}
