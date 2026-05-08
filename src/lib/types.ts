// 前端使用 'user' | 'assistant'，送給 Gemini 時轉換為 'user' | 'model'
export type MessageRole = 'user' | 'assistant'

export interface Message {
  role: MessageRole
  content: string
}

export interface ChatRequest {
  messages: Message[]
  resumeText?: string
  applicationRecord?: string
}
