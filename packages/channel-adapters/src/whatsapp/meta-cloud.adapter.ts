import axios from 'axios'
import type { ChannelAdapter, NormalizedMessage, OutboundMessage } from '../base.adapter'

const GRAPH_URL = 'https://graph.facebook.com/v20.0'

interface MetaCloudWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<{
          from: string
          id: string
          timestamp: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string; sha256: string; caption?: string }
          document?: { id: string; mime_type: string; filename?: string; caption?: string }
          audio?: { id: string; mime_type: string }
          video?: { id: string; mime_type: string; caption?: string }
          sticker?: { id: string; mime_type: string }
        }>
        statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>
      }
      field: string
    }>
  }>
}

export class MetaCloudWhatsAppAdapter implements ChannelAdapter {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string
  ) {}

  parseWebhook(payload: unknown): NormalizedMessage | null {
    const p = payload as MetaCloudWebhookPayload

    if (p.object !== 'whatsapp_business_account') return null

    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const messages = value.messages ?? []
        if (!messages.length) continue

        const msg = messages[0]
        // Skip status updates
        if (!msg) continue

        const contactName = value.contacts?.[0]?.profile?.name
        const phoneNumberId = value.metadata?.phone_number_id

        let contentType: NormalizedMessage['contentType'] = 'text'
        let text: string | undefined
        let mediaUrl: string | undefined
        let mimeType: string | undefined
        let filename: string | undefined

        switch (msg.type) {
          case 'text':
            contentType = 'text'
            text = msg.text?.body
            break
          case 'image':
            contentType = 'image'
            mimeType = msg.image?.mime_type
            text = msg.image?.caption
            // Media ID needs to be fetched separately — store as placeholder
            mediaUrl = msg.image?.id ? `meta-media://${msg.image.id}` : undefined
            break
          case 'document':
            contentType = 'document'
            mimeType = msg.document?.mime_type
            filename = msg.document?.filename
            mediaUrl = msg.document?.id ? `meta-media://${msg.document.id}` : undefined
            break
          case 'audio':
            contentType = 'audio'
            mimeType = msg.audio?.mime_type
            mediaUrl = msg.audio?.id ? `meta-media://${msg.audio.id}` : undefined
            break
          case 'video':
            contentType = 'video'
            mimeType = msg.video?.mime_type
            text = msg.video?.caption
            mediaUrl = msg.video?.id ? `meta-media://${msg.video.id}` : undefined
            break
          case 'sticker':
            contentType = 'sticker'
            mediaUrl = msg.sticker?.id ? `meta-media://${msg.sticker.id}` : undefined
            break
          default:
            return null
        }

        return {
          externalId: msg.id,
          channelType: 'whatsapp',
          channelIdentifier: phoneNumberId,
          senderExternalId: msg.from,
          senderName: contactName,
          contentType,
          text,
          mediaUrl,
          mimeType,
          filename,
          timestamp: new Date(Number(msg.timestamp) * 1000),
          raw: payload,
        }
      }
    }

    return null
  }

  async sendMessage(message: OutboundMessage): Promise<{ externalId: string }> {
    const body =
      message.contentType === 'text'
        ? {
            messaging_product: 'whatsapp',
            to: message.recipientExternalId,
            type: 'text',
            text: { body: message.text ?? '' },
          }
        : {
            messaging_product: 'whatsapp',
            to: message.recipientExternalId,
            type: 'image',
            image: { link: message.mediaUrl, caption: message.text },
          }

    const response = await axios.post(
      `${GRAPH_URL}/${this.phoneNumberId}/messages`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return { externalId: response.data.messages?.[0]?.id ?? '' }
  }

  /** Verify credentials are valid by fetching phone number info */
  async verifyCredentials(): Promise<{ valid: boolean; displayNumber?: string; name?: string }> {
    try {
      const res = await axios.get(`${GRAPH_URL}/${this.phoneNumberId}`, {
        params: { fields: 'display_phone_number,verified_name', access_token: this.accessToken },
      })
      return {
        valid: true,
        displayNumber: res.data.display_phone_number,
        name: res.data.verified_name,
      }
    } catch {
      return { valid: false }
    }
  }
}
