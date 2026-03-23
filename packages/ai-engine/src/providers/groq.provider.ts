import Groq from 'groq-sdk'
import type { AIProvider, ChatMessage, CompletionOptions, CompletionResult } from './base.provider'

export class GroqProvider implements AIProvider {
  private client: Groq

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey })
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const model = options.model ?? 'llama-3.3-70b-versatile'

    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    })

    const choice = response.choices[0]
    return {
      content: choice.message.content ?? '',
      tokensInput: response.usage?.prompt_tokens ?? 0,
      tokensOutput: response.usage?.completion_tokens ?? 0,
      model,
    }
  }
}
