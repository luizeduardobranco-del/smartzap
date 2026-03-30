import OpenAI from 'openai'
import { chunkText, chunkFAQ } from './chunker'

export interface EmbedResult {
  content: string
  embedding: number[]
  metadata: Record<string, unknown>
}

export class Embedder {
  private client: OpenAI
  private model = 'text-embedding-3-small'

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async embedText(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text.slice(0, 8192), // max input length
    })
    return response.data[0].embedding
  }

  async processText(
    text: string,
    sourceMetadata: Record<string, unknown> = {}
  ): Promise<EmbedResult[]> {
    const chunks = chunkText(text, sourceMetadata)
    return this.embedChunks(chunks)
  }

  async processFAQ(
    question: string,
    answer: string,
    sourceMetadata: Record<string, unknown> = {}
  ): Promise<EmbedResult[]> {
    const chunks = chunkFAQ(question, answer, sourceMetadata)
    return this.embedChunks(chunks)
  }

  async processURL(url: string, sourceMetadata: Record<string, unknown> = {}): Promise<EmbedResult[]> {
    const text = await fetchUrlText(url)
    return this.processText(text, { ...sourceMetadata, sourceUrl: url })
  }

  private async embedChunks(
    chunks: { content: string; metadata: Record<string, unknown> }[]
  ): Promise<EmbedResult[]> {
    if (chunks.length === 0) return []

    // Batch embed (max 100 per request)
    const results: EmbedResult[] = []
    const BATCH = 50

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch.map((c) => c.content),
      })
      for (let j = 0; j < batch.length; j++) {
        results.push({
          content: batch[j].content,
          embedding: response.data[j].embedding,
          metadata: batch[j].metadata,
        })
      }
    }

    return results
  }
}

async function fetchUrlText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ZapAgent/1.0 (knowledge-indexer)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`)

  const html = await response.text()
  // Strip HTML tags and clean whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000) // max 50k chars
}
