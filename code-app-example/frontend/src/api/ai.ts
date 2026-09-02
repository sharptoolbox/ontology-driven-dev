import { getToken, http } from './request'

export interface RenderPayload {
  type: 'text' | 'table' | 'chart' | 'action'
  content?: string
  columns?: string[]
  rows?: Record<string, any>[]
  label?: string
  path?: string
  chart_type?: string
  title?: string
  data?: Record<string, any>[]
}

export interface AiConfig {
  base_url: string
  api_key_masked: string
  model_id: string
  max_tokens: number
  configured: boolean
}

export interface TestResult {
  success: boolean
  latency_ms: number
  reply: string
  message: string
}

export interface ChatCallbacks {
  onDelta: (text: string) => void
  onRender: (payload: RenderPayload) => void
  onToolCall: (name: string) => void
  onDone: () => void
  onError: (msg: string) => void
}

export const aiApi = {
  getConfig() {
    return http.get<AiConfig>('/ai/config')
  },
  saveConfig(data: { base_url: string; api_key: string; model_id: string; max_tokens: number }) {
    return http.post('/ai/config', data)
  },
  testConnection(data: { base_url: string; api_key: string; model_id: string; max_tokens: number }) {
    return http.post<TestResult>('/ai/test', data)
  },
  async chat(message: string, history: { role: string; content: string }[], cb: ChatCallbacks) {
    const token = getToken()
    let resp: Response
    try {
      resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, history }),
      })
    } catch (e: any) {
      cb.onError('网络错误：' + e.message)
      cb.onDone()
      return
    }
    if (!resp.ok || !resp.body) {
      const body = await resp.json().catch(() => null)
      cb.onError(body?.message || `请求失败（HTTP ${resp.status}）`)
      cb.onDone()
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventType = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const l = line.trim()
        if (l.startsWith('event:')) {
          eventType = l.slice(6).trim()
        } else if (l.startsWith('data:')) {
          const data = l.slice(5).trim()
          if (!data) continue
          let payload: any = {}
          try { payload = JSON.parse(data) } catch { continue }
          if (eventType === 'delta') cb.onDelta(payload.content || '')
          else if (eventType === 'render_payload') cb.onRender(payload)
          else if (eventType === 'tool_call') cb.onToolCall(payload.name || '')
          else if (eventType === 'message_end') cb.onDone()
        }
      }
    }
    cb.onDone()
  },
}
