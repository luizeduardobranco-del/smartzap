import axios from 'axios'
import type { ChannelAdapter, NormalizedMessage, OutboundMessage } from '../base.adapter'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

interface InstagramMessage {
  mid: string
  text?: string
  is_echo?: boolean
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file'
    payload: { url: string }
  }>
}

interface InstagramWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    messaging: Array<{
      sender: { id: string }
      recipient: { id: string }
      timestamp: number
      message?: InstagramMessage
    }>
  }>
}

export class MetaInstagramAdapter implements ChannelAdapter {
  constructor(
    private readonly igUserId: string,
    private readonly pageAccessToken: string
  ) {}

  parseWebhook(payload: unknown): NormalizedMessage | null {
    const p = payload as InstagramWebhookPayload
    if (p.object !== 'instagram') return null

    for (const entry of p.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const msg = event.message
        if (!msg) continue
        // Skip echoes (messages sent by us)
        if (msg.is_echo) continue

        let contentType: NormalizedMessage['contentType'] = 'text'
        let mediaUrl: string | undefined
        let mimeType: string | undefined

        if (msg.attachments?.length) {
          const att = msg.attachments[0]
          if (att.type === 'image') contentType = 'image'
          else if (att.type === 'audio') contentType = 'audio'
          else if (att.type === 'video') contentType = 'video'
          else contentType = 'document'
          mediaUrl = att.payload.url
        }

        return {
          externalId: msg.mid,
          channelType: 'instagram',
          channelIdentifier: entry.id,
          senderExternalId: event.sender.id,
          contentType,
          text: msg.text,
          mediaUrl,
          mimeType,
          timestamp: new Date(event.timestamp),
          raw: payload,
        }
      }
    }

    return null
  }

  async sendMessage(message: OutboundMessage): Promise<{ externalId: string }> {
    const body =
      message.contentType === 'text'
        ? { text: message.text }
        : { attachment: { type: 'image', payload: { url: message.mediaUrl, is_reusable: true } } }

    const response = await axios.post(
      `${GRAPH_URL}/${this.igUserId}/messages`,
      {
        recipient: { id: message.recipientExternalId },
        message: body,
      },
      {
        headers: {
          Authorization: `Bearer ${this.pageAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return { externalId: response.data.message_id ?? '' }
  }

  // ─── Static helpers for OAuth flow ─────────────────────────────────────────

  static async exchangeForLongLivedToken(
    shortToken: string,
    appId: string,
    appSecret: string
  ): Promise<string> {
    const res = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      },
    })
    return res.data.access_token
  }

  static async getPages(
    userToken: string
  ): Promise<Array<{ id: string; name: string; access_token: string }>> {
    const res = await axios.get(`${GRAPH_URL}/me/accounts`, {
      params: { access_token: userToken, fields: 'id,name,access_token' },
    })
    return res.data.data ?? []
  }

  static async getInstagramAccount(
    pageId: string,
    pageToken: string
  ): Promise<{ id: string; username: string } | null> {
    try {
      const res = await axios.get(`${GRAPH_URL}/${pageId}`, {
        params: {
          fields: 'instagram_business_account{id,username}',
          access_token: pageToken,
        },
      })
      return res.data.instagram_business_account ?? null
    } catch {
      return null
    }
  }

  static async subscribeToWebhooks(pageId: string, pageToken: string): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${pageId}/subscribed_apps`,
      { subscribed_fields: ['messages', 'messaging_postbacks'] },
      { params: { access_token: pageToken } }
    )
  }

  static async unsubscribeFromWebhooks(pageId: string, pageToken: string): Promise<void> {
    await axios
      .delete(`${GRAPH_URL}/${pageId}/subscribed_apps`, {
        params: { access_token: pageToken },
      })
      .catch(() => {})
  }
}
