import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Drawer, Input, List, Popover, message } from 'antd'
import { RobotOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { assistantApi } from '../api/assistant'
import { http } from '../api/request'

// AI 智能助理对话面板（工作台与管理控制台共用）。
// 模型选择器（用户规则 2026-10，对齐附图）：输入框左下「模型 · 推理(温度)档位」，点开
// Popover 选「模型（启用账号×目录）」与「参数档位（精确/均衡/创造 → 温度映射）」；
// 选择存 localStorage，下次会话保留。
interface ChatMsg {
  id: number
  role: 'user' | 'assistant'
  text: string
  action?: string
}

interface ModelOption {
  account_id: number
  account_name: string
  provider: string
  models: string[]
  default_model: string
}

// 参数档位（对齐"推理等级 Default"交互；映射温度）
const TEMP_PRESETS = [
  { key: 'default', label: 'Default', temp: 0, desc: '均衡稳定（模型默认温度）' },
  { key: 'precise', label: 'Precise', temp: 0.2, desc: '精确 · 适合查询类问答' },
  { key: 'creative', label: 'Creative', temp: 0.9, desc: '发散 · 适合文案与方案' },
]

export default function AIAssistantPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState<string[]>([
    '我有哪些待办？',
    '我的客户申请进展？',
    '审批怎么操作？',
    '流程有哪些节点？',
  ])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  // 选择：accountId + model + 温度档位;持久化 localStorage
  const [sel, setSel] = useState<{ accountId: number; model: string; temp: number; tempKey: string }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('opic_ai_model_sel') || 'null')
      if (saved && typeof saved.accountId === 'number') return saved
    } catch {}
    return { accountId: 0, model: '', temp: 0, tempKey: 'default' }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!open) return
    http
      .get<{ models: ModelOption[] }>('/api/assistant/models')
      .then((d) => {
        const opts = d.models || []
        setModelOptions(opts)
        setSel((s) => {
          if (opts.length === 0) return { ...s, accountId: 0, model: '' }
          const cur = opts.find((o) => o.account_id === s.accountId)
          if (cur) {
            const model = s.model && cur.models.includes(s.model) ? s.model : cur.default_model || cur.models[0] || ''
            return { ...s, model }
          }
          const first = opts[0]
          return { ...s, accountId: first.account_id, model: first.default_model || first.models[0] || '' }
        })
      })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    localStorage.setItem('opic_ai_model_sel', JSON.stringify(sel))
  }, [sel])

  const send = useCallback(
    async (preset?: string) => {
      const q = (preset ?? input).trim()
      if (!q || busy) return
      setInput('')
      setMessages((m) => [...m, { id: Date.now(), role: 'user', text: q }])
      setBusy(true)
      try {
        const reply = await assistantApi.chat(q, sel.accountId, sel.model, sel.temp)
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: 'assistant', text: reply.answer, action: reply.action },
        ])
        if (reply.hints?.length) setHints(reply.hints)
      } catch {
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: 'assistant', text: '请求失败，请稍后重试' },
        ])
      } finally {
        setBusy(false)
      }
    },
    [busy, input, sel],
  )

  const curOpt = modelOptions.find((o) => o.account_id === sel.accountId)
  const modelLabel = curOpt ? `${curOpt.account_name} · ${sel.model || '默认'}` : '规则引擎'
  const tempLabel = TEMP_PRESETS.find((t) => t.key === sel.tempKey)?.label || 'Default'

  // 模型+参数选择器（附图右下角形态：模型/推理等级 两行菜单）
  const picker = (
    <div style={{ width: 300 }}>
      <div style={{ fontSize: 12, color: '#999', padding: '4px 8px' }}>模型</div>
      {modelOptions.length === 0 && (
        <div style={{ padding: '6px 10px', color: '#bbb', fontSize: 13 }}>
          未配置模型账号，当前为内置规则问答。请在管理控制台「模型」中添加。
        </div>
      )}
      {modelOptions.map((o) =>
        ((o.models || []).length ? o.models : ['默认']).map((m) => {
          const active = o.account_id === sel.accountId && (o.models.length === 0 || sel.model === m)
          return (
            <div
              key={`${o.account_id}:${m}`}
              onClick={() => {
                setSel((s) => ({ ...s, accountId: o.account_id, model: o.models.length ? m : '' }))
                setPickerOpen(false)
              }}
              style={{
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                background: active ? '#e8f1ff' : 'transparent', color: active ? '#2266e3' : '#333',
                display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span>{o.account_name}</span>
              <span style={{ color: '#888' }}>{m}</span>
            </div>
          )
        }),
      )}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0' }} />
      <div style={{ fontSize: 12, color: '#999', padding: '4px 8px' }}>推理等级（温度档位）</div>
      {TEMP_PRESETS.map((t) => {
        const active = sel.tempKey === t.key
        return (
          <div
            key={t.key}
            title={t.desc}
            onClick={() => setSel((s) => ({ ...s, tempKey: t.key, temp: t.temp }))}
            style={{
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              background: active ? '#e8f1ff' : 'transparent', color: active ? '#2266e3' : '#333',
              display: 'flex', justifyContent: 'space-between',
            }}
          >
            <span>{t.label}</span>
            <span style={{ color: '#888' }}>{t.desc}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <Drawer
      title={
        <span>
          <RobotOutlined style={{ color: '#2266e3', marginRight: 8 }} />
          AI 智能助理
        </span>
      }
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      footer={
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={() => send()}
              placeholder="输入问题，如：我有哪些待办？"
              disabled={busy}
            />
            <Button type="primary" loading={busy} onClick={() => send()}>
              发送
            </Button>
          </div>
          {/* 模型/参数选择器（右下角,附图形态） */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#999' }}>工作区内回答 · 只读指引</span>
            <Popover
              content={picker}
              trigger="click"
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              placement="topRight"
            >
              <Button size="small" type="text" style={{ color: '#555', fontSize: 12 }}>
                <ThunderboltOutlined style={{ color: '#2266e3', marginRight: 4 }} />
                {modelLabel}
                <span style={{ color: '#bbb', margin: '0 4px' }}>{tempLabel}</span>
                <span style={{ color: '#999' }}>▲</span>
              </Button>
            </Popover>
          </div>
        </div>
      }
    >
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: '#f7f9fc' }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '24px 8px' }}>
            <RobotOutlined style={{ fontSize: 32, marginBottom: 12 }} />
            <div>我是 OPIC AI 智能助理，试试下方建议问题</div>
            {modelOptions.length > 0 && (
              <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
                当前模型：{modelLabel} · {tempLabel}
              </div>
            )}
          </div>
        )}
        <List
          dataSource={messages}
          renderItem={(m) => (
            <List.Item
              style={{
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                display: 'flex',
                padding: '4px 0',
                border: 'none',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: m.role === 'user' ? '#2266e3' : '#fff',
                  color: m.role === 'user' ? '#fff' : 'inherit',
                  border: m.role === 'assistant' ? '1px solid #e5e6eb' : 'none',
                }}
              >
                {m.text}
              </div>
            </List.Item>
          )}
        />
        {busy && (
          <div style={{ textAlign: 'center', color: '#999' }}>
            <Badge status="processing" /> 思考中…
          </div>
        )}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
        {hints.map((h) => (
          <Button
            key={h}
            size="small"
            type="link"
            style={{ padding: '0 6px' }}
            onClick={() => send(h)}
          >
            {h}
          </Button>
        ))}
      </div>
    </Drawer>
  )
}
