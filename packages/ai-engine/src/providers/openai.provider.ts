import type { AIProvider, ChatMessage, CompletionOptions, CompletionResult } from './base.provider'

export class OpenAIProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResult> {
    const model = options.model ?? 'gpt-4o-mini'

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `OpenAI API error ${res.status}: ${err?.error?.message ?? JSON.stringify(err)}`
      )
    }

    const data = await res.json()
    const choice = data.choices[0]
    return {
      content: choice.message.content ?? '',
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      model,
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        `OpenAI embeddings error ${res.status}: ${err?.error?.message ?? JSON.stringify(err)}`
      )
    }

    const data = await res.json()
    return data.data[0].embedding
  }
}
