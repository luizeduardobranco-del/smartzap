export interface TextChunk {
  content: string
  metadata: {
    chunkIndex: number
    sourceType?: string
    [key: string]: unknown
  }
}

const CHUNK_SIZE = 512 // tokens approximately
const CHUNK_OVERLAP = 50 // overlap between chunks

/**
 * Splits text into overlapping chunks for embedding and retrieval.
 * Uses character-based splitting as a proxy for token count.
 */
export function chunkText(text: string, sourceMetadata: Record<string, unknown> = {}): TextChunk[] {
  const cleanText = text.replace(/\s+/g, ' ').trim()

  if (cleanText.length === 0) return []

  // Approximate: 1 token ≈ 4 characters for Portuguese/English
  const chunkSizeChars = CHUNK_SIZE * 4
  const overlapChars = CHUNK_OVERLAP * 4

  const chunks: TextChunk[] = []
  let start = 0
  let chunkIndex = 0

  while (start < cleanText.length) {
    let end = start + chunkSizeChars

    // Try to end at a sentence boundary
    if (end < cleanText.length) {
      const sentenceEnd = cleanText.lastIndexOf('.', end)
      if (sentenceEnd > start + chunkSizeChars / 2) {
        end = sentenceEnd + 1
      }
    } else {
      end = cleanText.length
    }

    const content = cleanText.slice(start, end).trim()
    if (content.length > 50) {
      // Skip very small chunks
      chunks.push({
        content,
        metadata: {
          chunkIndex,
          ...sourceMetadata,
        },
      })
      chunkIndex++
    }

    start = end - overlapChars
  }

  return chunks
}

/**
 * Splits FAQ text (Q&A pairs) keeping each pair as a single chunk.
 */
export function chunkFAQ(
  question: string,
  answer: string,
  sourceMetadata: Record<string, unknown> = {}
): TextChunk[] {
  const content = `Pergunta: ${question}\nResposta: ${answer}`
  return [
    {
      content,
      metadata: {
        chunkIndex: 0,
        type: 'faq',
        ...sourceMetadata,
      },
    },
  ]
}
