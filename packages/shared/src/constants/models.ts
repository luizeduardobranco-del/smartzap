export const AI_MODELS = {
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    creditsPerKInputTokens: 1,
    creditsPerKOutputTokens: 4,
    contextWindow: 128000,
    description: 'Rápido e econômico. Ideal para atendimento básico.',
    isDefault: true,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    creditsPerKInputTokens: 5,
    creditsPerKOutputTokens: 15,
    contextWindow: 128000,
    description: 'Alta capacidade de raciocínio. Ideal para vendas complexas.',
    isDefault: false,
  },
  'claude-3-5-haiku-20251001': {
    id: 'claude-3-5-haiku-20251001',
    name: 'Claude Haiku',
    provider: 'anthropic',
    creditsPerKInputTokens: 1,
    creditsPerKOutputTokens: 5,
    contextWindow: 200000,
    description: 'Excelente custo-benefício com janela de contexto enorme.',
    isDefault: false,
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    creditsPerKInputTokens: 8,
    creditsPerKOutputTokens: 24,
    contextWindow: 200000,
    description: 'Máxima qualidade para casos de uso críticos.',
    isDefault: false,
  },
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    name: 'LLaMA 3.3 70B',
    provider: 'groq',
    creditsPerKInputTokens: 1,
    creditsPerKOutputTokens: 1,
    contextWindow: 128000,
    description: 'Open source. Ultra-rápido via Groq. Ótimo custo.',
    isDefault: false,
  },
  'deepseek-r1-distill-llama-70b': {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1',
    provider: 'groq',
    creditsPerKInputTokens: 2,
    creditsPerKOutputTokens: 6,
    contextWindow: 128000,
    description: 'Ótimo raciocínio. Alternativa econômica ao GPT-4.',
    isDefault: false,
  },
} as const

export type AIModelId = keyof typeof AI_MODELS

export function calculateCredits(
  modelId: AIModelId,
  tokensInput: number,
  tokensOutput: number
): number {
  const model = AI_MODELS[modelId]
  const inputCredits = Math.ceil((tokensInput / 1000) * model.creditsPerKInputTokens)
  const outputCredits = Math.ceil((tokensOutput / 1000) * model.creditsPerKOutputTokens)
  return Math.max(1, inputCredits + outputCredits) // mínimo 1 crédito por mensagem
}
