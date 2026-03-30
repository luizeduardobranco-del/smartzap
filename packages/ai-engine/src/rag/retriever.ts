import OpenAI from 'openai'

export interface RetrievedChunk {
  content: string
  similarity: number
  metadata: Record<string, unknown>
}

export interface RetrieverOptions {
  matchThreshold?: number
  matchCount?: number
}

export class Retriever {
  private client: OpenAI
  private model = 'text-embedding-3-small'

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async embedQuery(query: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: query,
    })
    return response.data[0].embedding
  }

  /** Format retrieved chunks as a context string for the system prompt */
  formatContext(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return ''
    return chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
  }
}
