import axios from 'axios'
import QRCode from 'qrcode'
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
    apiKey: string,
    private readonly instanceName: string
  ) {
    this.apiKey = apiKey.trim()
  }

  private readonly apiKey: string

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

  async createInstance(webhookUrl: string): Promise<void> {
    await axios.post(
      `${this.apiUrl}/instance/create`,
      {
        instanceName: this.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          enabled: true,
          url: webhookUrl,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      },
      { headers: { apikey: this.apiKey, 'Content-Type': 'application/json' } }
    )
  }

  async deleteInstance(): Promise<void> {
    await axios.delete(`${this.apiUrl}/instance/delete/${this.instanceName}`, {
      headers: { apikey: this.apiKey },
    }).catch(() => {}) // ignore if already deleted
  }

  async logout(): Promise<void> {
    await axios.delete(`${this.apiUrl}/instance/logout/${this.instanceName}`, {
      headers: { apikey: this.apiKey },
    }).catch(() => {})
  }

  async getQRCode(): Promise<{ base64: string } | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/instance/connect/${this.instanceName}`, {
        headers: { apikey: this.apiKey },
      })

      // Evolution API may return base64 image directly or raw QR code string
      if (response.data.base64) {
        return { base64: response.data.base64 }
      }

      if (response.data.code) {
        const dataUrl = await QRCode.toDataURL(response.data.code)
        return { base64: dataUrl }
      }

      return null
    } catch {
      return null
    }
  }

  async getConnectionState(): Promise<'open' | 'connecting' | 'close'> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/instance/connectionState/${this.instanceName}`,
        { headers: { apikey: this.apiKey } }
      )
      return response.data.instance?.state ?? 'close'
    } catch {
      return 'close'
    }
  }

  async sendStatus(options: {
    type: 'image' | 'video' | 'text'
    content: string          // URL (image/video) or text content
    caption?: string
    backgroundColor?: string // for text stories
  }): Promise<void> {
    // Fetch owner JID — required by Evolution API v2 (statusJidList min length 1)
    let ownerJid: string | null = null
    try {
      const info = await axios.get(
        `${this.apiUrl}/instance/fetchInstances?instanceName=${this.instanceName}`,
        { headers: { apikey: this.apiKey } }
      )
      const inst = Array.isArray(info.data) ? info.data[0] : info.data
      console.log('[sendStatus] fetchInstances raw:', JSON.stringify(inst))
      const raw = inst?.instance?.owner ?? inst?.ownerJid ?? inst?.instance?.ownerJid
      if (raw) {
        // Normalize: "5511999999999:0@s.whatsapp.net" → "5511999999999@s.whatsapp.net"
        const phone = raw.split('@')[0].split(':')[0]
        ownerJid = `${phone}@s.whatsapp.net`
      }
    } catch (e: any) {
      console.error('[sendStatus] fetchInstances failed:', e?.message)
    }

    if (!ownerJid) {
      throw new Error('Não foi possível obter o JID do proprietário da instância. Verifique se o canal está conectado.')
    }

    // Always convert image/video URLs to base64 — Evolution API may not be able
    // to reach external URLs (Supabase storage, Canva, etc.) from its network.
    let content = options.content
    const isMediaUrl = (options.type === 'image' || options.type === 'video')
      && content.startsWith('http')

    if (isMediaUrl) {
      try {
        const mediaRes = await axios.get(content, {
          responseType: 'arraybuffer',
          maxRedirects: 10,
          timeout: 30_000,
        })
        const mimeType = mediaRes.headers['content-type'] ?? (options.type === 'video' ? 'video/mp4' : 'image/jpeg')
        const base64 = Buffer.from(mediaRes.data).toString('base64')
        content = `data:${mimeType};base64,${base64}`
        console.log('[sendStatus] resolved to base64, mime:', mimeType, 'bytes:', base64.length)
      } catch (e: any) {
        console.warn('[sendStatus] base64 conversion failed, sending URL directly:', e?.message)
      }
    }

    const body: Record<string, unknown> = {
      type: options.type,
      content,
      allContacts: true,        // broadcast para todos os contatos
      statusJidList: [ownerJid], // fallback para versões mais antigas
    }
    if (options.type === 'text') {
      body.backgroundColor = options.backgroundColor ?? '#000000'
      body.font = 1
    }
    if (options.caption) body.caption = options.caption

    console.log('[sendStatus] ownerJid:', ownerJid, '| type:', options.type, '| contentLength:', content.length, '| contentStart:', content.slice(0, 80))

    const url = `${this.apiUrl}/message/sendStatus/${this.instanceName}`
    try {
      const resp = await axios.post(url, body, {
        headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
      })
      console.log('[sendStatus] Evolution response:', resp.status, JSON.stringify(resp.data).slice(0, 200))
    } catch (e: any) {
      console.error('[sendStatus] Evolution error:', e?.response?.status, JSON.stringify(e?.response?.data))
      throw e
    }
  }

  async getConnectedPhone(): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/instance/fetchInstances?instanceName=${this.instanceName}`,
        { headers: { apikey: this.apiKey } }
      )
      const inst = Array.isArray(response.data) ? response.data[0] : response.data
      return inst?.instance?.profileName ?? inst?.instance?.owner?.split(':')[0] ?? null
    } catch {
      return null
    }
  }
}
