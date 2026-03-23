import axios from 'axios'
import type { ChannelAdapter, NormalizedMessage, OutboundMessage } from '../base.adapter'

interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
      id: string
    }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { url: string; mimetype: string; caption?: string }
      documentMessage?: { url: string; mimetype: string; fileName: string }
      audioMessage?: { url: string; mimetype: string }
    }
    messageTimestamp: number
  }
}

export class EvolutionWhatsAppAdapter implements ChannelAdapter {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string
  ) {}

  parseWebhook(payload: unknown): NormalizedMessage | null {
    const p = payload as EvolutionWebhookPayload

    // Only process incoming messages (not our own)
    if (p.event !== 'messages.upsert') return null
    if (p.data.key.fromMe) return null

    const remoteJid = p.data.key.remoteJid
    // Skip group messages for now (contain @g.us)
    if (remoteJid.includes('@g.us')) return null

    const phone = remoteJid.replace('@s.whatsapp.net', '')
    const msg = p.data.message

    if (!msg) return null

    // Extract text
    const text =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      undefined

    // Determine content type
    let contentType: NormalizedMessage['contentType'] = 'text'
    let mediaUrl: string | undefined
    let mimeType: string | undefined
    let filename: string | undefined

    if (msg.imageMessage) {
      contentType = 'image'
      mediaUrl = msg.imageMessage.url
      mimeType = msg.imageMessage.mimetype
    } else if (msg.documentMessage) {
      contentType = 'document'
      mediaUrl = msg.documentMessage.url
      mimeType = msg.documentMessage.mimetype
      filename = msg.documentMessage.fileName
    } else if (msg.audioMessage) {
      contentType = 'audio'
      mediaUrl = msg.audioMessage.url
      mimeType = msg.audioMessage.mimetype
    }

    return {
      externalId: p.data.key.id,
      channelType: 'whatsapp',
      channelIdentifier: p.instance,
      senderExternalId: phone,
      senderName: p.data.pushName,
      contentType,
      text,
      mediaUrl,
      mimeType,
      filename,
      timestamp: new Date(p.data.messageTimestamp * 1000),
      raw: payload,
    }
  }

  async sendMessage(message: OutboundMessage): Promise<{ externalId: string }> {
    const url = `${this.apiUrl}/message/sendText/${this.instanceName}`

    const response = await axios.post(
      url,
      {
        number: message.recipientExternalId,
        text: message.text,
      },
      {
        headers: {
          apikey: this.apiKey,
          'Content-Type': 'application/json',
        },
      }
    )

    return { externalId: response.data.key?.id ?? '' }
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string
  ): Promise<{ externalId: string }> {
    const url = `${this.apiUrl}/message/sendMedia/${this.instanceName}`
    const response = await axios.post(
      url,
      { number: phone, mediatype: 'image', media: imageUrl, caption },
      { headers: { apikey: this.apiKey } }
    )
    return { externalId: response.data.key?.id ?? '' }
  }

  async getQRCode(): Promise<{ base64: string }> {
    const response = await axios.get(`${this.apiUrl}/instance/connect/${this.instanceName}`, {
      headers: { apikey: this.apiKey },
    })
    return { base64: response.data.base64 }
  }

  async getConnectionState(): Promise<'open' | 'connecting' | 'close'> {
    const response = await axios.get(
      `${this.apiUrl}/instance/connectionState/${this.instanceName}`,
      { headers: { apikey: this.apiKey } }
    )
    return response.data.instance?.state ?? 'close'
  }
}
