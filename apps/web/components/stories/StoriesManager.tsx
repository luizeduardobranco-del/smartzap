'use client'

import { useState, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, Trash2, Loader2, X, Send, Clock, CheckCircle2, AlertCircle,
  Image as ImageIcon, Type, Video, Instagram, Smartphone, CalendarDays,
  RefreshCw, Eye, Pencil, Upload,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type StoryPost = {
  id: string
  name: string
  channel_id: string
  channel_type: 'whatsapp' | 'instagram'
  media_type: 'image' | 'video' | 'text'
  media_url: string | null
  caption: string | null
  background_color: string | null
  status: 'draft' | 'scheduled' | 'sent' | 'failed'
  scheduled_at: string | null
  repeat_days: number[] | null
  repeat_time: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
  channels?: { id: string; credentials: Record<string, string>; agents?: { id: string; name: string }[] }
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const schema = z.object({
  name:            z.string().min(1, 'Nome obrigatório'),
  channelId:       z.string().min(1, 'Selecione um canal'),
  channelType:     z.enum(['whatsapp', 'instagram']),
  mediaType:       z.enum(['image', 'video', 'text']),
  mediaUrl:        z.string().optional().or(z.literal('')),
  caption:         z.string().optional(),
  backgroundColor: z.string().optional(),
  scheduledAt:     z.string().optional(),
  repeatDays:      z.array(z.number()).optional(),
  repeatTime:      z.string().optional(),
})

type FormData = z.infer<typeof schema>

const STATUS_CONFIG = {
  draft:     { label: 'Rascunho',   color: 'text-gray-600 bg-gray-100',   icon: Clock },
  scheduled: { label: 'Agendado',   color: 'text-blue-600 bg-blue-100',   icon: CalendarDays },
  sent:      { label: 'Enviado',    color: 'text-green-600 bg-green-100', icon: CheckCircle2 },
  failed:    { label: 'Falha',      color: 'text-red-600 bg-red-100',     icon: AlertCircle },
}

const MEDIA_OPTIONS = [
  { value: 'image', label: 'Imagem', icon: ImageIcon },
  { value: 'video', label: 'Vídeo',  icon: Video },
  { value: 'text',  label: 'Texto',  icon: Type },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function StoriesManager() {
  const [editing, setEditing] = useState<StoryPost | null>(null)
  const [creating, setCreating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const utils = trpc.useUtils()
  const { data: posts = [], isLoading } = trpc.stories.list.useQuery()
  const { data: channels = [] } = trpc.channels.list.useQuery()

  const whatsappChannels = channels.filter((c: any) => c.type === 'whatsapp' && c.status === 'connected')

  const createMutation  = trpc.stories.create.useMutation({
    onSuccess: () => { utils.stories.list.invalidate(); setCreating(false); setMutationError(null) },
    onError: (e) => setMutationError(e.message),
  })
  const updateMutation  = trpc.stories.update.useMutation({
    onSuccess: () => { utils.stories.list.invalidate(); setEditing(null); setMutationError(null) },
    onError: (e) => setMutationError(e.message),
  })
  const deleteMutation  = trpc.stories.delete.useMutation({ onSuccess: () => utils.stories.list.invalidate() })
  const [sendToast, setSendToast] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  const sendNowMutation = trpc.stories.sendNow.useMutation({
    onSuccess: (data, vars) => {
      utils.stories.list.invalidate()
      setSendingId(null)
      setSendToast({ id: vars.id, ok: true, msg: 'Story enviado com sucesso!' })
      setTimeout(() => setSendToast(null), 5000)
    },
    onError: (e, vars) => {
      utils.stories.list.invalidate()
      setSendingId(null)
      setSendToast({ id: vars.id, ok: false, msg: e.message || 'Erro ao enviar story' })
      setTimeout(() => setSendToast(null), 8000)
    },
  })

  const defaultValues: FormData = {
    name: '', channelId: '', channelType: 'whatsapp', mediaType: 'image',
    mediaUrl: '', caption: '', backgroundColor: '#000000',
    scheduledAt: '', repeatDays: [], repeatTime: '09:00',
  }

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const mediaType    = watch('mediaType')
  const channelType  = watch('channelType')
  const repeatDaysW  = watch('repeatDays') ?? []

  function openCreate() {
    reset(defaultValues)
    setEditing(null)
    setCreating(true)
    setUploadedUrls([])
    setUploadError(null)
    setMutationError(null)
  }

  function openEdit(post: StoryPost) {
    // Reconstitui uploadedUrls a partir do media_url salvo (pode ser JSON array)
    try {
      const parsed = JSON.parse(post.media_url ?? '')
      if (Array.isArray(parsed)) setUploadedUrls(parsed)
      else setUploadedUrls(post.media_url ? [post.media_url] : [])
    } catch {
      setUploadedUrls(post.media_url ? [post.media_url] : [])
    }
    setUploadError(null)
    reset({
      name:            post.name,
      channelId:       post.channel_id,
      channelType:     post.channel_type,
      mediaType:       post.media_type,
      mediaUrl:        post.media_url ?? '',
      caption:         post.caption ?? '',
      backgroundColor: post.background_color ?? '#000000',
      scheduledAt:     post.scheduled_at ? post.scheduled_at.slice(0, 16) : '',
      repeatDays:      post.repeat_days ?? [],
      repeatTime:      post.repeat_time ?? '09:00',
    })
    setCreating(false)
    setEditing(post)
  }

  function onSubmit(values: FormData) {
    // Se há múltiplos arquivos, serializa como JSON array; caso contrário usa a URL simples
    const mediaUrl = uploadedUrls.length > 1
      ? JSON.stringify(uploadedUrls)
      : (uploadedUrls[0] ?? values.mediaUrl ?? undefined)

    const payload = {
      name:            values.name,
      channelId:       values.channelId,
      channelType:     values.channelType,
      mediaType:       values.mediaType,
      mediaUrl:        mediaUrl || undefined,
      caption:         values.caption || undefined,
      backgroundColor: values.backgroundColor,
      scheduledAt:     values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
      repeatDays:      values.repeatDays?.length ? values.repeatDays : undefined,
      repeatTime:      values.repeatTime || undefined,
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    setUploading(true)
    setUploadError(null)

    try {
      const form = new FormData()
      files.forEach(f => form.append('files', f))

      const res = await fetch('/api/stories/upload', { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Erro ao fazer upload')

      const newUrls: string[] = json.urls ?? []
      const allUrls = [...uploadedUrls, ...newUrls]
      setUploadedUrls(allUrls)
      // Primeiro arquivo vai para mediaUrl (compatibilidade); os demais ficam em uploadedUrls
      setValue('mediaUrl', allUrls[0] ?? '', { shouldValidate: true })

      if (json.errors?.length) {
        setUploadError(`Aviso: ${json.errors.join('; ')}`)
      }
    } catch (err: any) {
      setUploadError(err?.message ?? 'Erro ao fazer upload')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeUploadedUrl(url: string) {
    const remaining = uploadedUrls.filter(u => u !== url)
    setUploadedUrls(remaining)
    setValue('mediaUrl', remaining[0] ?? '', { shouldValidate: true })
  }

  function handleSendNow(post: StoryPost) {
    setSendingId(post.id)
    sendNowMutation.mutate({ id: post.id })
  }

  const showForm = creating || !!editing
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex h-full gap-6 p-6">
      {/* ── Left: list ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        {/* Toast de feedback do envio */}
        {sendToast && (
          <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            sendToast.ok
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            <span>{sendToast.msg}</span>
            <button onClick={() => setSendToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Stories</h1>
            <p className="text-sm text-gray-500 mt-0.5">Agende posts automáticos no Status do WhatsApp e Instagram</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Story
          </button>
        </div>

        {/* Channel banner — Instagram coming soon */}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
          <Instagram className="h-4 w-4 mt-0.5 shrink-0" />
          <span><strong>Instagram Stories</strong> — disponível assim que sua integração for aprovada pela Meta. Os posts já podem ser criados e agendados.</span>
        </div>

        {/* Posts list */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <ImageIcon className="h-10 w-10" />
            <p className="text-sm">Nenhum story criado ainda.</p>
            <button onClick={openCreate} className="text-sm text-primary hover:underline">Criar o primeiro</button>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto">
            {(posts as StoryPost[]).map((post) => {
              const st = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft
              const Icon = st.icon
              const isSending = sendingId === post.id
              return (
                <div key={post.id} className="flex items-start gap-4 rounded-xl border bg-white p-4 shadow-sm hover:shadow transition-shadow">
                  {/* Preview thumbnail */}
                  <div className="shrink-0">
                    {post.media_url ? (
                      <img
                        src={post.media_url}
                        alt={post.name}
                        className="h-16 w-10 rounded-lg object-cover border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div
                        className="flex h-16 w-10 items-center justify-center rounded-lg border text-white text-xs font-bold"
                        style={{ backgroundColor: post.background_color ?? '#2563eb' }}
                      >
                        <Type className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 truncate">{post.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
                        <Icon className="h-3 w-3" />
                        {st.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                        {post.channel_type === 'instagram' ? <Instagram className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                        {post.channel_type === 'instagram' ? 'Instagram' : 'WhatsApp'}
                      </span>
                      {post.repeat_days?.length ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-600">
                          <RefreshCw className="h-3 w-3" />
                          {post.repeat_days.map(d => DAYS[d]).join(', ')} {post.repeat_time}
                        </span>
                      ) : null}
                    </div>
                    {post.caption && <p className="mt-1 text-sm text-gray-500 truncate">{post.caption}</p>}
                    {post.scheduled_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        Agendado: {new Date(post.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                    {post.sent_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        Último envio: {new Date(post.sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                    {post.error_message && (
                      <p className="mt-1 text-xs text-red-500 truncate">{post.error_message}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {['draft', 'scheduled', 'failed'].includes(post.status) && post.channel_type === 'whatsapp' && (
                      <button
                        onClick={() => handleSendNow(post)}
                        disabled={isSending}
                        title="Enviar agora"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50 transition-colors"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(post)}
                      title="Editar"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate({ id: post.id })}
                      title="Excluir"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right: form ── */}
      {showForm && (
        <div className="w-96 shrink-0">
          <div className="sticky top-6 rounded-xl border bg-white p-5 shadow-sm">
            {/* Form header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editing ? 'Editar Story' : 'Novo Story'}</h2>
              <button onClick={() => { setCreating(false); setEditing(null) }} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Nome interno</label>
                <input
                  {...register('name')}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Ex: Sequência 1 — Dores"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>

              {/* Channel type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Canal</label>
                <Controller
                  name="channelType"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2">
                      {[
                        { value: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
                        { value: 'instagram', label: 'Instagram', icon: Instagram, disabled: false },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-xs font-medium transition-colors ${
                            field.value === opt.value ? 'border-primary bg-primary/5 text-primary' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <opt.icon className="h-3.5 w-3.5" />
                          {opt.label}
                          {opt.value === 'instagram' && (
                            <span className="rounded bg-purple-100 px-1 py-0.5 text-[9px] font-semibold text-purple-600">Em breve</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* WhatsApp channel selector */}
              {channelType === 'whatsapp' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Número WhatsApp</label>
                  <select
                    {...register('channelId')}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Selecione...</option>
                    {whatsappChannels.map((ch: any) => (
                      <option key={ch.id} value={ch.id}>
                        {(ch as any).agents?.name ?? ch.credentials?.instanceName ?? ch.id}
                      </option>
                    ))}
                  </select>
                  {errors.channelId && <p className="mt-1 text-xs text-red-500">{errors.channelId.message}</p>}
                  {whatsappChannels.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">Nenhum canal WhatsApp conectado.</p>
                  )}
                </div>
              )}

              {/* Media type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tipo de mídia</label>
                <Controller
                  name="mediaType"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2">
                      {MEDIA_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors ${
                            field.value === opt.value ? 'border-primary bg-primary/5 text-primary' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <opt.icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* Media upload + URL */}
              {mediaType !== 'text' && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">
                      {mediaType === 'image' ? 'Imagens' : 'Vídeos'}
                    </label>
                    {uploadedUrls.length > 0 && (
                      <span className="text-[11px] text-primary font-medium">
                        {uploadedUrls.length} arquivo{uploadedUrls.length > 1 ? 's' : ''} — cada um vira 1 story
                      </span>
                    )}
                  </div>

                  {/* Arquivos já carregados */}
                  {uploadedUrls.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {uploadedUrls.map((url, idx) => (
                        <div key={url} className="relative group">
                          {mediaType === 'image' ? (
                            <img src={url} alt={`arquivo ${idx + 1}`} className="h-14 w-10 rounded-lg object-cover border" />
                          ) : (
                            <div className="flex h-14 w-10 items-center justify-center rounded-lg border bg-gray-100 text-[10px] text-gray-500 font-medium">
                              <Video className="h-4 w-4" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeUploadedUrl(url)}
                            className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                          <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] text-white font-bold drop-shadow">{idx + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botão de upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={mediaType === 'image' ? 'image/*' : 'video/*'}
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-primary/50 hover:text-primary disabled:opacity-60 transition-colors"
                  >
                    {uploading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                      : <><Upload className="h-4 w-4" /> {uploadedUrls.length > 0 ? 'Adicionar mais arquivos' : `Enviar ${mediaType === 'image' ? 'imagem(ns)' : 'vídeo(s)'} do dispositivo`}</>
                    }
                  </button>

                  {uploadError && (
                    <p className="mt-1 text-xs text-amber-600">{uploadError}</p>
                  )}

                  {/* URL manual (fallback) */}
                  {uploadedUrls.length === 0 && (
                    <>
                      <div className="my-2 flex items-center gap-2 text-[11px] text-gray-400">
                        <div className="flex-1 h-px bg-gray-100" />
                        <span>ou cole uma URL pública</span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                      <input
                        {...register('mediaUrl')}
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="https://..."
                      />
                      {errors.mediaUrl && <p className="mt-1 text-xs text-red-500">{errors.mediaUrl.message}</p>}
                    </>
                  )}
                </div>
              )}

              {/* Text background color (text stories) */}
              {mediaType === 'text' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Cor de fundo</label>
                  <div className="flex items-center gap-2">
                    <input
                      {...register('backgroundColor')}
                      type="color"
                      className="h-9 w-14 rounded border cursor-pointer"
                    />
                    <input
                      {...register('backgroundColor')}
                      className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              )}

              {/* Caption */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {mediaType === 'text' ? 'Texto do Story' : 'Legenda (opcional)'}
                </label>
                <textarea
                  {...register('caption')}
                  rows={3}
                  className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={mediaType === 'text' ? 'Texto que aparece no Story...' : 'Legenda opcional...'}
                />
              </div>

              {/* Scheduled at */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Agendar envio</label>
                <input
                  {...register('scheduledAt')}
                  type="datetime-local"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Repeat */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-700">Repetir nos dias</label>
                <Controller
                  name="repeatDays"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-1 flex-wrap">
                      {DAYS.map((day, idx) => {
                        const selected = (field.value ?? []).includes(idx)
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const current = field.value ?? []
                              field.onChange(
                                selected ? current.filter(d => d !== idx) : [...current, idx]
                              )
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                              selected ? 'border-primary bg-primary/5 text-primary' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  )}
                />
                {repeatDaysW.length > 0 && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">Horário da repetição</label>
                    <input
                      {...register('repeatTime')}
                      type="time"
                      className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>

              {/* Erro de criação/edição */}
              {mutationError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {mutationError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Salvar alterações' : 'Criar Story'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
