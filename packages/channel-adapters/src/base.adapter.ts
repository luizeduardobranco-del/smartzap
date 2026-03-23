/**
 * NormalizedMessage is the common interface that all channel adapters must produce.
 * This decouples the message processing logic from channel-specific formats.
 */
export interface NormalizedMessage {
  /** Unique ID of this message in the external channel */
  externalId: string
  /** Channel type */
  channelType: 'whatsapp' | 'instagram' | 'widget'
  /** Channel instance identifier (e.g., WhatsApp phone number, Instagram page ID) */
  channelIdentifier: string
  /** Sender identifier in the external system (phone number, instagram user id, etc.) */
  senderExternalId: string
  /** Sender's display name if available */
  senderName?: string
  /** Message content type */
  contentType: 'text' | 'image' | 'audio' | 'document' | 'video' | 'sticker'
  /** Text content (for text messages) */
  text?: string
  /** URL to media (for non-text messages) */
  mediaUrl?: string
  /** MIME type of media */
  mimeType?: string
  /** Original filename (for documents) */
  filename?: string
  /** When the message was sent */
  timestamp: Date
  /** Raw payload from the channel for debugging */
  raw?: unknown
}

export interface OutboundMessage {
  channelType: 'whatsapp' | 'instagram' | 'widget'
  channelIdentifier: string
  recipientExternalId: string
  contentType: 'text' | 'image' | 'document'
  text?: string
  mediaUrl?: string
  filename?: string
}

export interface ChannelAdapter {
  /** Parse incoming webhook payload into normalized message */
  parseWebhook(payload: unknown, headers?: Record<string, string>): NormalizedMessage | null
  /** Send a message via this channel */
  sendMessage(message: OutboundMessage): Promise<{ externalId: string }>
}
