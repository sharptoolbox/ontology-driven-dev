import { http } from './request'

export interface AiConfig {
  base_url: string
  api_key: string
  model_id: string
  max_tokens: number
  updated_at?: string
}

export interface AiTable {
  columns: string[]
  rows: (string | number)[][]
}

export interface AiAnswer {
  answer: string
  kpis?: { label: string; value: string }[]
  table?: AiTable | null
  source?: 'RULE' | 'MODEL' | 'FALLBACK'
}

export const aiApi = {
  getConfig() {
    return http.get<AiConfig>('/ai/config')
  },
  saveConfig(payload: Partial<AiConfig>) {
    return http.put<AiConfig>('/ai/config', payload)
  },
  test() {
    return http.post<{ model?: string }>('/ai/config/test')
  },
  chat(question: string) {
    return http.post<AiAnswer>('/ai/chat', { question })
  },
}
