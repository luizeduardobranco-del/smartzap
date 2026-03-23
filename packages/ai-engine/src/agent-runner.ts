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
  const { personality, aiConfig, conversationHistory, userMessage, retrievedContext, env } = input

  // Build system prompt
  const systemPrompt = buildSystemPrompt(personality, retrievedContext)

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
    temperature: aiConfig.temperature,
    maxTokens: aiConfig.maxTokens,
    model: aiConfig.model,
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

function buildSystemPrompt(personality: AgentPersonality, retrievedContext?: string): string {
  const toneInstructions = {
    formal: 'Use linguagem formal e profissional.',
    casual: 'Use linguagem casual e descontraída.',
    friendly: 'Use linguagem amigável e acolhedora.',
    professional: 'Use linguagem profissional e direta.',
  }

  let prompt = `Você é ${personality.role} da empresa ${personality.companyName}.

${personality.companyContext}

## Instruções de comportamento
- ${toneInstructions[personality.tone]}
- Responda sempre em ${personality.language === 'pt-BR' ? 'português do Brasil' : personality.language}.
- Seja conciso e objetivo. Evite respostas longas desnecessárias.
- Se não souber a resposta, diga: "${personality.fallbackMessage}"

## Restrições
${personality.restrictions.map((r) => `- ${r}`).join('\n')}
`

  if (retrievedContext) {
    prompt += `
## Base de conhecimento (use estas informações para responder)
${retrievedContext}

IMPORTANTE: Use as informações acima para embasar suas respostas. Não invente informações que não estejam aqui.
`
  }

  return prompt
}

function getProvider(aiConfig: AgentAIConfig, env: AgentRunInput['env']) {
  switch (aiConfig.provider) {
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
      throw new Error(`Unknown AI provider: ${aiConfig.provider}`)
  }
}
