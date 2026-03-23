import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, ChatMessage, CompletionOptions, CompletionResult } from './base.provider'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const model = options.model ?? 'claude-haiku-4-5-20251001'

    // Separate system message from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages.filter((m) => m.role !== 'system')

    const response = await this.client.messages.create({
      model,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: options.maxTokens ?? 1024,
    })

    const content = response.content[0]
    return {
      content: content.type === 'text' ? content.text : '',
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      model,
    }
  }
}
