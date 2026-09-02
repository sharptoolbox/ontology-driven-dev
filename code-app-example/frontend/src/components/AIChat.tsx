import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { Send, Sparkles } from 'lucide-react'
import { aiApi, type RenderPayload } from '../api/ai'
import { toast } from './toast'

interface Msg {
  role: 'user' | 'ai'
  text: string
  render: RenderPayload[]
}

export default function AIChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: '您好，我是 AI 智能助理，基于大模型为您提供业务问答、数据查询与功能导航服务。', render: [] },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [toolName, setToolName] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight)
  }, [messages, streaming, toolName])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history = messages.filter((m) => m.text.trim()).slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text, render: [] }, { role: 'ai', text: '', render: [] }])
    setStreaming(true)
    setToolName('')

    const appendDelta = (d: string) =>
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, text: last.text + d }
        return next
      })
    const appendRender = (p: RenderPayload) =>
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, render: [...last.render, p] }
        return next
      })

    await aiApi.chat(text, history, {
      onDelta: appendDelta,
      onRender: appendRender,
      onToolCall: (name) => setToolName(name),
      onDone: () => { setStreaming(false); setToolName('') },
      onError: (msg) => { appendDelta(msg); setStreaming(false); setToolName('') },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-header">
        <div className="chat-logo"><Sparkles size={16} /></div>
        <span className="chat-title">AI 智能助理</span>
      </div>
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#fcfdfe' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '92%' }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: m.role === 'user' ? 'var(--primary-color)' : '#fff',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--divider-color)',
                  whiteSpace: 'pre-wrap',
                  fontSize: '9pt',
                }}
              >
                {m.role === 'ai' && !m.text && streaming && <span style={{ color: '#94a3b8' }}>思考中…</span>}
                <span>{m.text}</span>
              </div>
              {m.render && m.render.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {m.render.map((r, j) => <RenderItem key={j} r={r} navigate={navigate} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && toolName && <div style={{ color: '#94a3b8', fontSize: '9pt', marginBottom: 8 }}>正在调用工具：{toolName} …</div>}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--divider-color)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            rows={2}
            style={{ flex: 1, resize: 'none' }}
            placeholder="请输入您的问题…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end', height: 36 }} onClick={send} disabled={streaming}>
            <Send size={14} />
          </button>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '9pt', marginTop: 6 }}>AI 对话仅支持只读查询，写操作请通过固定页面执行</div>
      </div>
    </div>
  )
}

function RenderItem({ r, navigate }: { r: RenderPayload; navigate: (p: string) => void }) {
  if (r.type === 'text') return <div style={{ fontSize: '9pt' }}>{r.content}</div>
  if (r.type === 'action')
    return (
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => r.path && navigate(r.path)}>
        {r.label}
      </button>
    )
  if (r.type === 'table')
    return (
      <div className="table-container" style={{ fontSize: '9pt' }}>
        <table>
          <thead><tr>{(r.columns || []).map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {(r.rows || []).map((row, i) => (
              <tr key={i}>{(r.columns || []).map((c, j) => <td key={j}>{row[c] ?? '-'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  if (r.type === 'chart') {
    const chartType = r.chart_type || 'bar'
    if (chartType === 'pie') {
      const option = {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        series: [{ type: 'pie', radius: '62%', center: ['50%', '45%'], data: (r.data || []).map((d) => ({ name: d.name, value: d.value })) }],
      }
      return <ReactECharts option={option} style={{ height: 230, width: '100%' }} />
    }
    const names = (r.data || []).map((d) => d.name)
    const numericKeys = Object.keys((r.data || [])[0] || {}).filter((k) => k !== 'name')
    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: numericKeys, textStyle: { fontSize: 10 } },
      grid: { left: 44, right: 16, top: 30, bottom: 24 },
      xAxis: { type: 'category', data: names, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value' },
      series: numericKeys.map((k) => ({ name: k, type: chartType === 'line' ? 'line' : 'bar', data: (r.data || []).map((d) => d[k]) })),
    }
    return <ReactECharts option={option} style={{ height: 220, width: '100%' }} />
  }
  return null
}
