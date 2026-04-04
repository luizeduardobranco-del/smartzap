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
  env: {
    openaiApiKey?: string
    anthropicApiKey?: string
    groqApiKey?: string
  }
}

export interface AgentRunResult extends CompletionResult {
  shouldHandoffToHuman: boolean
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const { personality, aiConfig, conversationHistory, userMessage, retrievedContext, campaignContext, env } = input

  // Build system prompt
  const systemPrompt = buildSystemPrompt(personality, aiConfig, retrievedContext, campaignContext)

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
  const shouldHandoffToHuman = personality.humanHandoffTrigger
    ? userMessage.toLowerCase().includes(personality.humanHandoffTrigger.toLowerCase())
    : false

  return {
    ...result,
    shouldHandoffToHuman,
  }
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
