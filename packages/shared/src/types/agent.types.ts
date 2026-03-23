import type { AIModelId } from '../constants/models'

export type AgentStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface AgentPersonality {
  tone: 'formal' | 'casual' | 'friendly' | 'professional'
  language: 'pt-BR' | 'en-US' | 'es'
  role: string // ex: "Atendente de suporte"
  companyName: string
  companyContext: string // descrição da empresa
  restrictions: string[] // ex: ["Não mencione concorrentes", "Não faça promessas de preço"]
  greeting: string // mensagem inicial
  fallbackMessage: string // quando não souber responder
  humanHandoffTrigger?: string // frase para transferir para humano
}

export interface AgentAIConfig {
  provider: 'openai' | 'anthropic' | 'groq'
  model: AIModelId
  temperature: number // 0.0 - 1.0
  maxTokens: number
  systemPromptTemplate?: string // template customizado (plano Pro+)
  toolsEnabled: AgentTool[]
}

export type AgentTool =
  | 'calendar_booking'
  | 'lead_capture'
  | 'order_lookup'
  | 'send_document'
  | 'human_handoff'

export interface AgentBehaviorConfig {
  autoReply: boolean
  replyDelayMs: number // delay artificial para parecer humano
  businessHours?: BusinessHours
  maxConversationLength: number // número máximo de mensagens antes de handoff
  collectLeadInfo: boolean // coletar nome, email, telefone automaticamente
}

export interface BusinessHours {
  timezone: string // ex: "America/Sao_Paulo"
  schedule: {
    [day in
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday'
      | 'sunday']?: {
      enabled: boolean
      start: string // "09:00"
      end: string // "18:00"
    }
  }
  outsideHoursMessage: string
}
