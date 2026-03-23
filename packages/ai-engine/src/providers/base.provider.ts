export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionResult {
  content: string
  tokensInput: number
  tokensOutput: number
  model: string
}

export interface AIProvider {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>
}

export interface CompletionOptions {
  temperature?: number
  maxTokens?: number
  model?: string
}
