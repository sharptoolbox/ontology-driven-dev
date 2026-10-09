/** AI 智能助理 API（v4：多模型选择/参数档位） */
import { http } from './request'

export interface AssistantReply {
  answer: string
  hints: string[]
  action?: string
}

export interface ModelOption {
  account_id: number
  account_name: string
  provider: string
  models: string[]
  default_model: string
}

export const assistantApi = {
  chat: (question: string, accountId?: number, model?: string, temperature?: number) =>
    http.post<AssistantReply>('/api/assistant/chat', {
      question,
      account_id: accountId || 0,
      model: model || '',
      temperature: temperature ?? 0,
    }),
  models: () => http.get<{ models: ModelOption[] }>('/api/assistant/models'),
}
