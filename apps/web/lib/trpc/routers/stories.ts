import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { EvolutionWhatsAppAdapter, MetaInstagramAdapter } from '@zapagent/channel-adapters'

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const storiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('story_posts')
      .select('*, channels(id, credentials, agents(id, name))')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  create: protectedProcedure
    .input(z.object({
      name:            z.string().min(1, 'Nome obrigatório'),
      channelId:       z.string().uuid('Canal inválido'),
      channelType:     z.enum(['whatsapp', 'instagram']).default('whatsapp'),
      mediaType:       z.enum(['image', 'video', 'text']).default('image'),
      mediaUrl:        z.string().optional(),
      caption:         z.string().optional(),
      backgroundColor: z.string().optional(),
      scheduledAt:     z.string().datetime().optional(),
      repeatDays:      z.array(z.number().min(0).max(6)).optional(),
      repeatTime:      z.string().optional(), // "HH:MM"
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const status = input.scheduledAt ? 'scheduled' : 'draft'
      const { data, error } = await ctx.supabase
        .from('story_posts')
        .insert({
          organization_id:  orgId,
          channel_id:       input.channelId,
          channel_type:     input.channelType,
          name:             input.name,
          media_type:       input.mediaType,
          media_url:        input.mediaUrl ?? null,
          caption:          input.caption ?? null,
          background_color: input.backgroundColor ?? '#000000',
          status,
          scheduled_at:     input.scheduledAt ?? null,
          repeat_days:      input.repeatDays ?? null,
          repeat_time:      input.repeatTime ?? null,
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: protectedProcedure
    .input(z.object({
      id:              z.string().uuid(),
      name:            z.string().min(1).optional(),
      channelId:       z.string().uuid().optional(),
      channelType:     z.enum(['whatsapp', 'instagram']).optional(),
      mediaType:       z.enum(['image', 'video', 'text']).optional(),
      mediaUrl:        z.string().optional().nullable(),
      caption:         z.string().optional().nullable(),
      backgroundColor: z.string().optional(),
      scheduledAt:     z.string().datetime().optional().nullable(),
      repeatDays:      z.array(z.number().min(0).max(6)).optional().nullable(),
      repeatTime:      z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { id, ...fields } = input

      // Re-compute status if scheduledAt changes
      const updates: Record<string, unknown> = {}
      if (fields.name !== undefined)            updates.name             = fields.name
      if (fields.channelId !== undefined)       updates.channel_id       = fields.channelId
      if (fields.channelType !== undefined)     updates.channel_type     = fields.channelType
      if (fields.mediaType !== undefined)       updates.media_type       = fields.mediaType
      if (fields.mediaUrl !== undefined)        updates.media_url        = fields.mediaUrl
      if (fields.caption !== undefined)         updates.caption          = fields.caption
      if (fields.backgroundColor !== undefined) updates.background_color = fields.backgroundColor
      if (fields.repeatDays !== undefined)      updates.repeat_days      = fields.repeatDays
      if (fields.repeatTime !== undefined)      updates.repeat_time      = fields.repeatTime
      if (fields.scheduledAt !== undefined) {
        updates.scheduled_at = fields.scheduledAt
        updates.status = fields.scheduledAt ? 'scheduled' : 'draft'
      }

      const { data, error } = await ctx.supabase
        .from('story_posts')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('story_posts')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  sendNow: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      console.log('[sendNow] orgId:', orgId, 'postId:', input.id)

      // Busca o post sem join (join pode falhar se FK não estiver configurada no Supabase)
      const { data: post, error: postError } = await ctx.supabase
        .from('story_posts')
        .select('*')
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .single()

      console.log('[sendNow] post:', post?.id, 'status:', post?.status, 'channel_id:', post?.channel_id, 'error:', postError?.message)

      if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: `Post não encontrado: ${postError?.message}` })
      if (!['draft', 'scheduled', 'failed'].includes(post.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Post já enviado' })
      }

      // Busca o canal separadamente
      const { data: channel, error: channelError } = await ctx.supabase
        .from('channels')
        .select('id, credentials, type')
        .eq('id', post.channel_id)
        .single()

      console.log('[sendNow] channel:', channel?.id, 'type:', channel?.type, 'error:', channelError?.message)

      const credentials = channel?.credentials as Record<string, string> | null

      // ── Instagram ────────────────────────────────────────────────────────────
      if (post.channel_type === 'instagram') {
        const igUserId = credentials?.igUserId
        const pageAccessToken = credentials?.pageAccessToken

        if (!igUserId || !pageAccessToken) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Canal Instagram sem igUserId ou pageAccessToken. channel_id=${post.channel_id}`,
          })
        }

        try {
          let mediaUrls: string[] = []
          if (post.media_url) {
            try {
              const parsed = JSON.parse(post.media_url)
              mediaUrls = Array.isArray(parsed) ? parsed : [post.media_url]
            } catch {
              mediaUrls = [post.media_url]
            }
          }

          const caption = post.caption ?? undefined
          const mediaType = (post.media_type as string | null)?.toUpperCase()

          if (mediaUrls.length > 1) {
            await MetaInstagramAdapter.publishCarousel(igUserId, pageAccessToken, { imageUrls: mediaUrls, caption })
          } else if (mediaUrls.length === 1) {
            const isVideo = mediaType === 'VIDEO' || mediaType === 'REELS'
            await MetaInstagramAdapter.publishPost(igUserId, pageAccessToken, {
              imageUrl: isVideo ? undefined : mediaUrls[0],
              videoUrl: isVideo ? mediaUrls[0] : undefined,
              caption,
              mediaType: isVideo ? (mediaType as 'VIDEO' | 'REELS') : 'IMAGE',
            })
          } else {
            throw new Error('Post Instagram sem mídia — publicação de texto puro não é suportada')
          }

          await ctx.supabase
            .from('story_posts')
            .update({
              status: post.repeat_days?.length ? 'scheduled' : 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('id', post.id)

          return { success: true }
        } catch (err: any) {
          const responseData = err?.response?.data
          const message = responseData
            ? `Instagram [${err?.response?.status}]: ${JSON.stringify(responseData)}`
            : (err instanceof Error ? err.message : 'Falha ao publicar no Instagram')

          await ctx.supabase
            .from('story_posts')
            .update({ status: 'failed', error_message: message })
            .eq('id', post.id)

          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
        }
      }

      // ── WhatsApp ─────────────────────────────────────────────────────────────
      const instanceName = credentials?.instanceName
      console.log('[sendNow] instanceName:', instanceName)

      if (!instanceName) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Canal sem instanceName. channel_id=${post.channel_id} channel=${JSON.stringify(channel)} err=${channelError?.message}` })
      }

      try {
        const adapter = new EvolutionWhatsAppAdapter(
          process.env.EVOLUTION_API_URL!,
          process.env.EVOLUTION_API_KEY!,
          instanceName
        )
        let mediaUrls: string[] = []
        if (post.media_url) {
          try {
            const parsed = JSON.parse(post.media_url)
            mediaUrls = Array.isArray(parsed) ? parsed : [post.media_url]
          } catch {
            mediaUrls = [post.media_url]
          }
        }

        if (mediaUrls.length > 0) {
          for (const url of mediaUrls) {
            await adapter.sendStatus({
              type: post.media_type as 'image' | 'video' | 'text',
              content: url,
              caption: post.caption ?? undefined,
              backgroundColor: post.background_color ?? '#000000',
            })
          }
        } else {
          await adapter.sendStatus({
            type: 'text',
            content: post.caption ?? '',
            backgroundColor: post.background_color ?? '#000000',
          })
        }

        await ctx.supabase
          .from('story_posts')
          .update({
            status: post.repeat_days?.length ? 'scheduled' : 'sent',
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', post.id)

        return { success: true }
      } catch (err: any) {
        const responseData = err?.response?.data
        const message = responseData
          ? `Evolution [${err?.response?.status}]: ${JSON.stringify(responseData)}`
          : (err instanceof Error ? err.message : 'Falha ao enviar')

        await ctx.supabase
          .from('story_posts')
          .update({ status: 'failed', error_message: message })
          .eq('id', post.id)

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),
})
