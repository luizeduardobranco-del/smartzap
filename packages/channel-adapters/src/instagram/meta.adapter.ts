import axios from 'axios'
import type { ChannelAdapter, NormalizedMessage, OutboundMessage } from '../base.adapter'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const IG_GRAPH_URL = 'https://graph.instagram.com/v21.0'

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
      `${IG_GRAPH_URL}/${this.igUserId}/messages`,
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

  /**
   * Instagram Business Login — exchange short-lived token for long-lived (60 days).
   * Uses graph.instagram.com instead of graph.facebook.com.
   */
  static async exchangeInstagramLongLivedToken(
    shortToken: string,
    appId: string,
    appSecret: string
  ): Promise<string> {
    const res = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        access_token: shortToken,
      },
    })
    return res.data.access_token
  }

  /**
   * Instagram Business Login — get the authenticated Instagram user's id and username.
   */
  static async getInstagramUser(accessToken: string): Promise<{ id: string; username: string }> {
    const res = await axios.get('https://graph.instagram.com/v21.0/me', {
      params: { fields: 'user_id,username', access_token: accessToken },
    })
    // Instagram returns user_id (string) and username
    return { id: res.data.user_id ?? res.data.id, username: res.data.username }
  }

  /**
   * Instagram Business Login — subscribe Instagram user account to webhook messages.
   * No Facebook Page required.
   */
  static async subscribeInstagramUser(igUserId: string, accessToken: string): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${igUserId}/subscribed_apps`,
      null,
      { params: { access_token: accessToken, subscribed_fields: 'messages' } }
    )
  }

  /**
   * Instagram Business Login — unsubscribe Instagram user account from webhook messages.
   */
  static async unsubscribeInstagramUser(igUserId: string, accessToken: string): Promise<void> {
    await axios
      .delete(`${GRAPH_URL}/${igUserId}/subscribed_apps`, {
        params: { access_token: accessToken },
      })
      .catch(() => {})
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

  /** @deprecated Use exchangeInstagramLongLivedToken for Instagram Business Login */
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

  /** @deprecated Use subscribeInstagramUser for Instagram Business Login */
  static async subscribeToWebhooks(pageId: string, pageToken: string): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${pageId}/subscribed_apps`,
      { subscribed_fields: ['messages', 'messaging_postbacks'] },
      { params: { access_token: pageToken } }
    )
  }

  /** @deprecated Use unsubscribeInstagramUser for Instagram Business Login */
  static async unsubscribeFromWebhooks(pageId: string, pageToken: string): Promise<void> {
    await axios
      .delete(`${GRAPH_URL}/${pageId}/subscribed_apps`, {
        params: { access_token: pageToken },
      })
      .catch(() => {})
  }

  // ─── Content Publishing ─────────────────────────────────────────────────────

  static async publishPost(
    igUserId: string,
    pageAccessToken: string,
    options: {
      imageUrl?: string
      videoUrl?: string
      caption?: string
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS'
      /** ISO-8601 string — if provided, schedules instead of publishing immediately */
      scheduledPublishTime?: string
    }
  ): Promise<{ containerId: string; mediaId?: string }> {
    const { imageUrl, videoUrl, caption, mediaType, scheduledPublishTime } = options
    const isScheduled = !!scheduledPublishTime

    // Step 1: create media container
    const containerParams: Record<string, string> = {
      access_token: pageAccessToken,
      caption: caption ?? '',
    }

    if (videoUrl) {
      containerParams.video_url = videoUrl
      containerParams.media_type = mediaType ?? 'VIDEO'
    } else if (imageUrl) {
      containerParams.image_url = imageUrl
      containerParams.media_type = 'IMAGE'
    }

    if (isScheduled) {
      const epochSeconds = Math.floor(new Date(scheduledPublishTime).getTime() / 1000)
      containerParams.scheduled_publish_time = String(epochSeconds)
      containerParams.published = 'false'
    }

    const containerRes = await axios.post(
      `${GRAPH_URL}/${igUserId}/media`,
      null,
      { params: containerParams }
    )
    const containerId: string = containerRes.data.id

    // Step 2: publish immediately (skip if scheduled — Meta publishes automatically)
    if (!isScheduled) {
      const publishRes = await axios.post(
        `${GRAPH_URL}/${igUserId}/media_publish`,
        null,
        { params: { creation_id: containerId, access_token: pageAccessToken } }
      )
      return { containerId, mediaId: publishRes.data.id }
    }

    return { containerId }
  }

  static async publishCarousel(
    igUserId: string,
    pageAccessToken: string,
    options: {
      imageUrls: string[]
      caption?: string
      scheduledPublishTime?: string
    }
  ): Promise<{ containerId: string; mediaId?: string }> {
    const { imageUrls, caption, scheduledPublishTime } = options
    const isScheduled = !!scheduledPublishTime

    // Step 1: create child containers for each image
    const childIds: string[] = []
    for (const imageUrl of imageUrls) {
      const res = await axios.post(
        `${GRAPH_URL}/${igUserId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            is_carousel_item: 'true',
            access_token: pageAccessToken,
          },
        }
      )
      childIds.push(res.data.id)
    }

    // Step 2: create carousel container
    const carouselParams: Record<string, string> = {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: caption ?? '',
      access_token: pageAccessToken,
    }

    if (isScheduled) {
      const epochSeconds = Math.floor(new Date(scheduledPublishTime).getTime() / 1000)
      carouselParams.scheduled_publish_time = String(epochSeconds)
      carouselParams.published = 'false'
    }

    const containerRes = await axios.post(
      `${GRAPH_URL}/${igUserId}/media`,
      null,
      { params: carouselParams }
    )
    const containerId: string = containerRes.data.id

    // Step 3: publish immediately
    if (!isScheduled) {
      const publishRes = await axios.post(
        `${GRAPH_URL}/${igUserId}/media_publish`,
        null,
        { params: { creation_id: containerId, access_token: pageAccessToken } }
      )
      return { containerId, mediaId: publishRes.data.id }
    }

    return { containerId }
  }
}
