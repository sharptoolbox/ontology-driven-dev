import { useCallback, useEffect, useState } from 'react'
import { Popover } from 'antd'
import { DoubleRightOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { assistantApi } from '../api/assistant'
import { http } from '../api/request'

// AI 智能助理工作区（用户工作台与管理控制台共用的右侧常驻面板,用户规则 2026-10）。
// 复用 .app-chat* 玻璃样式(user-workbench.css,[data-glass] 作用域双端生效);
// 折叠态由宿主布局持久化;对话携带模型选择(与悬浮抽屉共享 localStorage 选择)。
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

const TEMP_PRESETS = [
  { key: 'default', label: 'Default', temp: 0, desc: '均衡稳定（模型默认温度）' },
  { key: 'precise', label: 'Precise', temp: 0.2, desc: '精确 · 适合查询类问答' },
  { key: 'creative', label: 'Creative', temp: 0.9, desc: '发散 · 适合文案与方案' },
]

export default function AIChatWorkspace({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const navigate = useNavigate()
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sel, setSel] = useState<{ accountId: number; model: string; temp: number; tempKey: string }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('opic_ai_model_sel') || 'null')
      if (saved && typeof saved.accountId === 'number') return saved
    } catch {
      /* 忽略坏数据 */
    }
    return { accountId: 0, model: '', temp: 0, tempKey: 'default' }
  })

  useEffect(() => {
    http
      .get<{ models: ModelOption[] }>('/api/assistant/models')
      .then((d) => {
        const opts = d.models || []
        setModelOptions(opts)
        setSel((s) => {
          if (opts.length === 0) return { ...s, accountId: 0, model: '' }
          const cur = opts.find((o) => o.account_id === s.accountId)
          if (cur) {
            const model = s.model && (cur.models || []).includes(s.model) ? s.model : cur.default_model || (cur.models || [])[0] || ''
            return { ...s, model }
          }
          const first = opts[0]
          return { ...s, accountId: first.account_id, model: first.default_model || (first.models || [])[0] || '' }
        })
      })
      .catch(() => {})
  }, [])

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
        setMessages((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: reply.answer, action: reply.action }])
        if (reply.hints?.length) setHints(reply.hints)
      } catch {
        setMessages((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: '助理服务暂时不可用，请稍后重试。' }])
      } finally {
        setBusy(false)
      }
    },
    [busy, input, sel],
  )

  const curOpt = modelOptions.find((o) => o.account_id === sel.accountId)
  const modelLabel = curOpt ? `${curOpt.account_name} · ${sel.model || '默认'}` : '规则引擎'
  const tempLabel = TEMP_PRESETS.find((t) => t.key === sel.tempKey)?.label || 'Default'

  const picker = (
    <div style={{ width: 290 }}>
      <div style={{ fontSize: 12, color: '#999', padding: '4px 8px' }}>模型</div>
      {modelOptions.length === 0 && (
        <div style={{ padding: '6px 10px', color: '#bbb', fontSize: 13 }}>
          未配置模型账号，当前为内置规则问答。请在管理控制台「AI 模型配置」中添加。
        </div>
      )}
      {modelOptions.map((o) =>
        ((o.models || []).length ? o.models : ['默认']).map((m) => {
          const active = o.account_id === sel.accountId && ((o.models || []).length === 0 || sel.model === m)
          return (
            <div
              key={`${o.account_id}:${m}`}
              onClick={() => {
                setSel((s) => ({ ...s, accountId: o.account_id, model: (o.models || []).length ? m : '' }))
                setPickerOpen(false)
              }}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                background: active ? '#e8f1ff' : 'transparent',
                color: active ? '#2266e3' : 'inherit',
                display: 'flex',
                justifyContent: 'space-between',
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
              padding: '7px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              background: active ? '#e8f1ff' : 'transparent',
              color: active ? '#2266e3' : 'inherit',
              display: 'flex',
              justifyContent: 'space-between',
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
    <aside className={`app-chat${collapsed ? ' app-chat-collapsed' : ''}`} aria-hidden={collapsed}>
      <div className="app-chat-inner">
        <div className="app-chat-header">
          <div className="app-chat-badge">
            <RobotOutlined />
          </div>
          <span className="app-chat-title">AI 智能助理</span>
          <span className="app-chat-chip">在线</span>
          <span
            className="app-trigger app-chat-close"
            onClick={onToggle}
            role="button"
            tabIndex={0}
            aria-label="收起 AI 助理"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onToggle()
            }}
          >
            <DoubleRightOutlined />
          </span>
        </div>
        <div
          className="app-chat-body"
          style={{ display: 'flex', flexDirection: 'column', padding: 12, gap: 8, overflowY: 'auto' }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                maxWidth: '92%',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'rgba(90,140,255,.28)' : 'rgba(255,255,255,.10)',
                border: '1px solid rgba(255,255,255,.16)',
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}
            >
              {m.text}
              {m.role === 'assistant' && m.action ? (
                <div style={{ marginTop: 6 }}>
                  <a
                    onClick={() => {
                      navigate(m.action!)
                      onToggle()
                    }}
                  >
                    → 前往对应页面
                  </a>
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <div style={{ alignSelf: 'flex-start', fontSize: 12, opacity: 0.7 }}>助理思考中…</div> : null}
          {messages.length === 0 && !busy ? (
            <div className="app-chat-empty">
              <div className="app-chat-empty-icon">
                <RobotOutlined />
              </div>
              <p className="app-chat-empty-title">我是 OPIC AI 助理</p>
              <p className="app-chat-empty-desc">可以查待办、客户进展、审批指引——试试下方问题</p>
            </div>
          ) : null}
          {hints.length > 0 && !busy ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
              {hints.map((h) => (
                <a
                  key={h}
                  onClick={() => void send(h)}
                  style={{
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,.22)',
                    background: 'rgba(255,255,255,.08)',
                  }}
                >
                  {h}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) void send()
            }}
            placeholder="输入问题，如：我有哪些待办？"
            style={{
              flex: 1,
              background: 'rgba(255,255,255,.10)',
              border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 10,
              color: 'inherit',
              padding: '8px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.24)',
              background: 'rgba(90,140,255,.35)',
              color: 'inherit',
              padding: '8px 14px',
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            发送
          </button>
        </div>
        {/* 模型/参数选择器（与悬浮抽屉同源,双端共享选择） */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 10px' }}>
          <Popover
            content={picker}
            trigger="click"
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            placement="topRight"
          >
            <span
              role="button"
              tabIndex={0}
              style={{ fontSize: 12, color: '#888', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ThunderboltOutlined style={{ color: '#2266e3' }} />
              {modelLabel}
              <span style={{ color: '#bbb', margin: '0 2px' }}>{tempLabel}</span>
              <span style={{ color: '#bbb' }}>▲</span>
            </span>
          </Popover>
        </div>
      </div>
    </aside>
  )
}
