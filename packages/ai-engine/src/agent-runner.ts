import type { AgentPersonality, AgentAIConfig, AgentBehaviorConfig } from '@zapagent/shared'
import type { ChatMessage, CompletionResult } from './providers/base.provider'
import { OpenAIProvider } from './providers/openai.provider'
import { AnthropicProvider } from './providers/anthropic.provider'
import { GroqProvider } from './providers/groq.provider'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentRunInput {
  personality: AgentPersonality
  aiConfig: AgentAIConfig
  behaviorConfig: AgentBehaviorConfig
  conversationHistory: ConversationMessage[]
  userMessage: string
  retrievedContext?: string // RAG context
  campaignContext?: string  // Campaign context — injected before system prompt
  /** Só para testes: simula a data de hoje (promoções com prazo). */
  today?: Date
  env: {
    openaiApiKey?: string
    anthropicApiKey?: string
    groqApiKey?: string
  }
}

export interface AgentRunResult extends CompletionResult {
  shouldHandoffToHuman: boolean
  /** Chaves de [[IMAGEM:chave]] pedidas pelo agente; quem chama resolve para URL. */
  images: string[]
  /** Conteúdo de [[LEAD]]...[[/LEAD]]: resumo para a equipe, nunca vai ao cliente. */
  leadSummary: string | null
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const { personality, aiConfig, conversationHistory, userMessage, retrievedContext, campaignContext, env } = input

  // Build system prompt
  // O modelo não sabe a data: sem isto, promoção "até 10/11" nunca vence.
  const systemPrompt = buildSystemPrompt(personality, aiConfig, retrievedContext, campaignContext)
    + `\n\n## Data de hoje\nHoje é ${hojeBrasilia(input.today)} (horário de Brasília).`

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  // Select provider
  const provider = getProvider(aiConfig, env)

  // Run completion
  const result = await provider.complete(messages, {
    temperature: aiConfig.temperature ?? 0.7,
    maxTokens: aiConfig.maxTokens ?? 1000,
    model: aiConfig.model ?? 'gpt-4o-mini',
  })

  // Check if handoff trigger was mentioned by user
  const userTriggered = personality.humanHandoffTrigger
    ? userMessage.toLowerCase().includes(personality.humanHandoffTrigger.toLowerCase())
    : false

  // O próprio agente pode pedir a transferência escrevendo o marcador na resposta
  // (ex.: triagem de cliente atual → financeiro). O marcador nunca chega ao cliente.
  let raw = result.content ?? ''
  const agentTriggered = HANDOFF_MARKER.test(raw)

  // [[LEAD]]...[[/LEAD]]; sem o fechamento, corta até o fim para nada vazar ao cliente.
  let leadSummary: string | null = null
  const lead = raw.match(LEAD_BLOCK) ?? raw.match(LEAD_OPEN_TO_END)
  if (lead) {
    leadSummary = lead[1].trim() || null
    raw = raw.replace(lead[0], '')
  }

  const images = [...raw.matchAll(IMAGE_MARKER_ALL)].map((m) => m[1].toLowerCase())
  raw = raw.replace(IMAGE_MARKER_ALL, '')

  const cleaned = raw.replace(HANDOFF_MARKER_ALL, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const content = cleaned || (agentTriggered ? 'Vou te passar agora para o atendimento.' : '')

  return {
    ...result,
    content,
    shouldHandoffToHuman: userTriggered || agentTriggered,
    images: [...new Set(images)],
    leadSummary,
  }
}

const HANDOFF_MARKER = /\[\[\s*ATENDENTE\s*\]\]/i
const HANDOFF_MARKER_ALL = /\[\[\s*ATENDENTE\s*\]\]/gi
const IMAGE_MARKER_ALL = /\[\[\s*IMAGEM\s*:\s*([a-z0-9_-]+)\s*\]\]/gi
const LEAD_BLOCK = /\[\[\s*LEAD\s*\]\]([\s\S]*?)\[\[\s*\/\s*LEAD\s*\]\]/i
const LEAD_OPEN_TO_END = /\[\[\s*LEAD\s*\]\]([\s\S]*)$/i

function hojeBrasilia(d = new Date()) {
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function buildSystemPrompt(personality: AgentPersonality, aiConfig: AgentAIConfig, retrievedContext?: string, campaignContext?: string): string {
  const toneInstructions: Record<string, string> = {
    formal: 'Use linguagem formal e profissional.',
    casual: 'Use linguagem casual e descontraída.',
    friendly: 'Use linguagem amigável e acolhedora.',
    professional: 'Use linguagem profissional e direta.',
  }

  // Cast to any to handle both the legacy type (role/companyName) and the
  // current form schema (instructions/greeting/farewell)
  const p = personality as unknown as Record<string, unknown>

  // If a full system prompt is provided, use it directly (only append knowledge context)
  const systemPromptField = (p.systemPrompt as string | undefined) ?? ''
  if (systemPromptField.trim()) {
    let prompt = systemPromptField.trim()
    if (campaignContext) {
      prompt = `## CONTEXTO OBRIGATÓRIO DESTA CONVERSA (leia antes de tudo)\n${campaignContext}\n\n---\n\n` + prompt
    }
    if (retrievedContext) {
      prompt += `\n\n## Base de conhecimento\n${retrievedContext}\n\nIMPORTANTE: Use as informações acima para embasar suas respostas. Se houver links ou URLs, compartilhe-os exatamente como estão.`
    }
    return prompt
  }

  const tone = (p.tone as string) ?? 'friendly'
  const language = (p.language as string) ?? 'pt-BR'
  const langLabel = language === 'pt-BR' ? 'português do Brasil' : language
  const toneLabel = toneInstructions[tone] ?? toneInstructions.friendly

  // If a custom template exists (Pro+ feature), use it directly
  if (aiConfig.systemPromptTemplate) {
    let prompt = aiConfig.systemPromptTemplate
    if (retrievedContext) {
      prompt += `\n\n## Base de conhecimento\n${retrievedContext}\n\nIMPORTANTE: Use as informações acima para embasar suas respostas. Se houver links ou URLs, compartilhe-os exatamente como estão.`
    }
    return prompt
  }

  // Prefer "instructions" (saved by the current editor form).
  // Fall back to the legacy role/companyName/companyContext fields.
  const instructions = (p.instructions as string | undefined) || ''
  const role = (p.role as string | undefined) || 'Assistente virtual'
  const companyName = (p.companyName as string | undefined) || 'nossa empresa'
  const companyContext = (p.companyContext as string | undefined) || ''
  const fallbackMessage = (p.fallbackMessage as string | undefined) || 'Não sei responder isso no momento, mas posso ajudar com outras dúvidas.'
  const restrictions = (p.restrictions as string[] | undefined) ?? []

  let baseContent: string
  if (instructions.trim()) {
    baseContent = instructions.trim()
  } else {
    baseContent = `Você é ${role} da empresa ${companyName}.${companyContext ? `\n\n${companyContext}` : ''}`
  }

  let prompt = `${baseContent}

## Instruções de comportamento
- ${toneLabel}
- Responda sempre em ${langLabel}.
- Seja conciso e objetivo. Evite respostas longas desnecessárias.
- Se não souber a resposta, diga: "${fallbackMessage}"
${restrictions.length > 0 ? `\n## Restrições\n${restrictions.map((r) => `- ${r}`).join('\n')}` : ''}`

  if (retrievedContext) {
    prompt += `
## Base de conhecimento (use estas informações para responder)
${retrievedContext}

IMPORTANTE: Use as informações acima para embasar suas respostas. Não invente informações que não estejam aqui.
Se a base de conhecimento contiver links, URLs ou sites, compartilhe-os exatamente como estão escritos, sem modificar, encurtar ou omitir.
`
  }

  return prompt
}

function getProvider(aiConfig: AgentAIConfig, env: AgentRunInput['env']) {
  const provider = aiConfig.provider ?? 'openai'
  switch (provider) {
    case 'openai':
      if (!env.openaiApiKey) throw new Error('OpenAI API key not configured')
      return new OpenAIProvider(env.openaiApiKey)
    case 'anthropic':
      if (!env.anthropicApiKey) throw new Error('Anthropic API key not configured')
      return new AnthropicProvider(env.anthropicApiKey)
    case 'groq':
      if (!env.groqApiKey) throw new Error('Groq API key not configured')
      return new GroqProvider(env.groqApiKey)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}
