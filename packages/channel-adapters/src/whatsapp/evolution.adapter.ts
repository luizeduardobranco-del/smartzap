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
      participant?: string
      // Quando o participante vem como LID (identidade oculta do WhatsApp), o número real
      // chega nestes campos companheiros. O nome varia por versão do Baileys/Evolution.
      senderPn?: string
      participantPn?: string
      participantAlt?: string
      senderAlt?: string
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
    // Em grupo (@g.us): o remetente real é o "participant"; o remoteJid é o JID do grupo.
    const isGroup = remoteJid.includes('@g.us')
    // O WhatsApp passou a entregar o participante de grupo como LID (`<id>@lid`), que NÃO
    // é telefone — é uma identidade opaca. Como só removíamos '@s.whatsapp.net' e '@g.us',
    // o senderExternalId virava "36369850196144@lid" e nenhum cruzamento por telefone
    // funcionava (0 de 143 leituras de abastecimento casaram com o cadastro de motoristas).
    // Quando o participante é LID, o número real vem num campo companheiro; preferimos ele.
    const k = p.data.key
    const ehLid = (s?: string) => !!s && s.includes('@lid')
    const participante = isGroup ? (k.participant || remoteJid) : remoteJid
    const numeroReal = [k.senderPn, k.participantPn, k.participantAlt, k.senderAlt]
      .find((c) => c && !ehLid(c))
    const senderJid = (ehLid(participante) && numeroReal) ? numeroReal : participante
    const phone = senderJid
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '')
      .replace('@lid', '')
    if (ehLid(participante) && !numeroReal) {
      // Sem número no payload não há como identificar o motorista. Logamos as chaves
      // disponíveis para descobrir em qual campo esta versão da Evolution manda o telefone.
      console.warn('[evolution] participante veio como LID e sem telefone', {
        participante, camposDisponiveis: Object.keys(k),
      })
    }
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
      isGroup,
      groupJid: isGroup ? remoteJid : undefined,
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

  async sendVideo(
    phone: string,
    videoUrl: string,
    caption?: string
  ): Promise<{ externalId: string }> {
    const url = `${this.apiUrl}/message/sendMedia/${this.instanceName}`
    const response = await axios.post(
      url,
      { number: phone, mediatype: 'video', mimetype: 'video/mp4', media: videoUrl, caption },
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
    // Helper: parse a raw owner field into a valid E164@s.whatsapp.net JID
    const parseOwnerJid = (raw: unknown): string | null => {
      if (!raw || raw === 'None' || raw === 'null' || raw === 'undefined') return null
      const str = String(raw)
      const phone = str.split('@')[0].split(':')[0]
      // Must be all digits (a real phone number)
      return /^\d{6,}$/.test(phone) ? `${phone}@s.whatsapp.net` : null
    }

    // Fetch owner JID — needed by some Evolution API versions for statusJidList
    let ownerJid: string | null = null

    // Attempt 1: fetchInstances
    try {
      const info = await axios.get(
        `${this.apiUrl}/instance/fetchInstances?instanceName=${this.instanceName}`,
        { headers: { apikey: this.apiKey } }
      )
      const inst = Array.isArray(info.data) ? info.data[0] : info.data
      console.log('[sendStatus] fetchInstances raw:', JSON.stringify(inst))
      ownerJid =
        parseOwnerJid(inst?.instance?.owner) ??
        parseOwnerJid(inst?.ownerJid) ??
        parseOwnerJid(inst?.instance?.ownerJid)
    } catch (e: any) {
      console.error('[sendStatus] fetchInstances failed:', e?.message)
    }

    // Attempt 2: connectionState (sometimes exposes owner in a different path)
    if (!ownerJid) {
      try {
        const cs = await axios.get(
          `${this.apiUrl}/instance/connectionState/${this.instanceName}`,
          { headers: { apikey: this.apiKey } }
        )
        console.log('[sendStatus] connectionState raw:', JSON.stringify(cs.data))
        ownerJid =
          parseOwnerJid(cs.data?.instance?.owner) ??
          parseOwnerJid(cs.data?.ownerJid)
      } catch (e: any) {
        console.warn('[sendStatus] connectionState failed:', e?.message)
      }
    }

    console.log('[sendStatus] resolved ownerJid:', ownerJid)

    // Send the URL directly to Evolution — Evolution API fetches it from Supabase storage
    // (bucket is public, Evolution can access it). Converting to base64 was causing
    // oversized payloads (~2 MB) which Evolution accepted but WhatsApp rendered blank.
    const content = options.content

    const body: Record<string, unknown> = {
      type: options.type,
      content,
      allContacts: true, // broadcast para todos os contatos
    }
    // Include statusJidList only when we have a real JID — a bogus JID (e.g. "None@...") causes blank statuses
    if (ownerJid) {
      body.statusJidList = [ownerJid]
    }
    if (options.type === 'text') {
      body.backgroundColor = options.backgroundColor ?? '#000000'
      body.font = 1
    }
    if (options.caption) body.caption = options.caption

    console.log('[sendStatus] ownerJid:', ownerJid ?? 'none (allContacts only)', '| type:', options.type, '| contentLength:', content.length, '| contentStart:', content.slice(0, 80))

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
      const owner = inst?.instance?.owner
      const profileName = inst?.instance?.profileName
      if (profileName && profileName !== 'None') return profileName
      if (owner && owner !== 'None') return owner.split(':')[0]
      return null
    } catch {
      return null
    }
  }
}
