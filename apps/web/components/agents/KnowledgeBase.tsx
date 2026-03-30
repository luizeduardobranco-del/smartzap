'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FileText, HelpCircle, Link2, Trash2, Loader2, Plus, CheckCircle, AlertCircle, Clock, RefreshCw, Pencil, X, Check, Image
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const typeConfig = {
  text: { label: 'Texto', icon: FileText, color: 'text-blue-500 bg-blue-50' },
  faq: { label: 'FAQ', icon: HelpCircle, color: 'text-purple-500 bg-purple-50' },
  url: { label: 'URL', icon: Link2, color: 'text-green-500 bg-green-50' },
  image: { label: 'Imagem', icon: Image, color: 'text-pink-500 bg-pink-50' },
  document: { label: 'Documento', icon: FileText, color: 'text-orange-500 bg-orange-50' },
}

const statusConfig = {
  pending: { label: 'Aguardando', icon: Clock, class: 'text-yellow-600 bg-yellow-50' },
  processing: { label: 'Processando', icon: Loader2, class: 'text-blue-600 bg-blue-50' },
  ready: { label: 'Pronto', icon: CheckCircle, class: 'text-green-600 bg-green-50' },
  error: { label: 'Erro', icon: AlertCircle, class: 'text-red-600 bg-red-50' },
}

type TabType = 'text' | 'faq' | 'url' | 'image'

const textSchema = z.object({ name: z.string().min(1, 'Obrigatório'), content: z.string().min(10, 'Mínimo 10 caracteres') })
const faqSchema = z.object({ question: z.string().min(3, 'Obrigatório'), answer: z.string().min(3, 'Obrigatório') })
const urlSchema = z.object({ url: z.string().url('URL inválida') })
const imageSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  imageUrl: z.string().url('URL inválida'),
  description: z.string().optional(),
})

async function triggerProcess(sourceId: string) {
  try {
    await fetch('/api/knowledge/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    })
  } catch {
    // Process failures don't block the save — item will show with "error" status
  }
}

export function KnowledgeBase({ agentId }: { agentId: string }) {
  const [addTab, setAddTab] = useState<TabType>('text')
  const [showForm, setShowForm] = useState(false)
  const utils = trpc.useUtils()

  const { data: sources = [], isLoading } = trpc.knowledge.list.useQuery({ agentId }, { refetchInterval: 5000 })

  const imageForm = useForm<z.infer<typeof imageSchema>>({ resolver: zodResolver(imageSchema) })

  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, string>>({})

  const updateSource = trpc.knowledge.update.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate({ agentId })
      setEditingId(null)
    },
    onError: (err) => setSaveError(err.message),
  })

  function startEdit(source: any) {
    const metadata = source.metadata as Record<string, string> ?? {}
    if (source.type === 'text') {
      setEditFields({ name: source.name, content: metadata.content ?? '' })
    } else if (source.type === 'faq') {
      setEditFields({ question: metadata.question ?? '', answer: metadata.answer ?? '' })
    } else if (source.type === 'url') {
      setEditFields({ url: metadata.url ?? '' })
    } else if (source.type === 'image') {
      setEditFields({ name: source.name, imageUrl: metadata.imageUrl ?? '', description: metadata.description ?? '' })
    }
    setEditingId(source.id)
  }

  function saveEdit(source: any) {
    if (source.type === 'text') {
      updateSource.mutate({
        id: source.id,
        name: editFields.name,
        metadata: { content: editFields.content },
      })
    } else if (source.type === 'faq') {
      updateSource.mutate({
        id: source.id,
        name: editFields.question?.slice(0, 100),
        metadata: { question: editFields.question, answer: editFields.answer },
      })
    } else if (source.type === 'url') {
      updateSource.mutate({
        id: source.id,
        metadata: { url: editFields.url },
      })
    } else if (source.type === 'image') {
      updateSource.mutate({
        id: source.id,
        name: editFields.name,
        metadata: { imageUrl: editFields.imageUrl, description: editFields.description ?? '' },
      })
    }
  }

  const addText = trpc.knowledge.addText.useMutation({
    onSuccess: async (source) => {
      setSaveError(null)
      utils.knowledge.list.invalidate({ agentId })
      setShowForm(false)
      textForm.reset()
      await triggerProcess(source.id)
      utils.knowledge.list.invalidate({ agentId })
    },
    onError: (err) => setSaveError(err.message),
  })

  const addFAQ = trpc.knowledge.addFAQ.useMutation({
    onSuccess: async (source) => {
      setSaveError(null)
      utils.knowledge.list.invalidate({ agentId })
      setShowForm(false)
      faqForm.reset()
      await triggerProcess(source.id)
      utils.knowledge.list.invalidate({ agentId })
    },
    onError: (err) => setSaveError(err.message),
  })

  const addURL = trpc.knowledge.addURL.useMutation({
    onSuccess: async (source) => {
      setSaveError(null)
      utils.knowledge.list.invalidate({ agentId })
      setShowForm(false)
      urlForm.reset()
      await triggerProcess(source.id)
      utils.knowledge.list.invalidate({ agentId })
    },
    onError: (err) => setSaveError(err.message),
  })

  const addImage = trpc.knowledge.addImage.useMutation({
    onSuccess: async (source) => {
      setSaveError(null)
      utils.knowledge.list.invalidate({ agentId })
      setShowForm(false)
      imageForm.reset()
      await triggerProcess(source.id)
      utils.knowledge.list.invalidate({ agentId })
    },
    onError: (err) => setSaveError(err.message),
  })

  const deleteSource = trpc.knowledge.delete.useMutation({
    onSuccess: () => utils.knowledge.list.invalidate({ agentId }),
  })

  const textForm = useForm<z.infer<typeof textSchema>>({ resolver: zodResolver(textSchema) })
  const faqForm = useForm<z.infer<typeof faqSchema>>({ resolver: zodResolver(faqSchema) })
  const urlForm = useForm<z.infer<typeof urlSchema>>({ resolver: zodResolver(urlSchema) })

  const isSaving = addText.isPending || addFAQ.isPending || addURL.isPending || addImage.isPending

  const reprocess = async (sourceId: string) => {
    await triggerProcess(sourceId)
    utils.knowledge.list.invalidate({ agentId })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Base de Conhecimento</h2>
          <p className="text-xs text-muted-foreground">Adicione conteúdo para o agente usar nas respostas</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          Erro ao salvar: {saveError}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border bg-muted/30 p-4">
          {/* Tab switcher */}
          <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
            {(['text', 'faq', 'url', 'image'] as TabType[]).map((t) => (
              <button
                key={t}
                onClick={() => setAddTab(t)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  addTab === t ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'text' ? 'Texto' : t === 'faq' ? 'FAQ' : t === 'url' ? 'URL' : 'Imagem'}
              </button>
            ))}
          </div>

          {addTab === 'text' && (
            <form onSubmit={textForm.handleSubmit((d) => addText.mutate({ agentId, ...d }))} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Título</label>
                <input
                  {...textForm.register('name')}
                  placeholder="Ex: Política de devolução"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {textForm.formState.errors.name && (
                  <p className="mt-0.5 text-xs text-red-500">{textForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Conteúdo</label>
                <textarea
                  {...textForm.register('content')}
                  rows={5}
                  placeholder="Cole aqui o texto que o agente deve conhecer..."
                  className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {textForm.formState.errors.content && (
                  <p className="mt-0.5 text-xs text-red-500">{textForm.formState.errors.content.message}</p>
                )}
              </div>
              <FormFooter onCancel={() => setShowForm(false)} isPending={isSaving} />
            </form>
          )}

          {addTab === 'faq' && (
            <form onSubmit={faqForm.handleSubmit((d) => addFAQ.mutate({ agentId, ...d }))} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Pergunta</label>
                <input
                  {...faqForm.register('question')}
                  placeholder="Ex: Quais são os horários de atendimento?"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {faqForm.formState.errors.question && (
                  <p className="mt-0.5 text-xs text-red-500">{faqForm.formState.errors.question.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Resposta</label>
                <textarea
                  {...faqForm.register('answer')}
                  rows={3}
                  placeholder="Ex: Atendemos de segunda a sexta, das 8h às 18h."
                  className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {faqForm.formState.errors.answer && (
                  <p className="mt-0.5 text-xs text-red-500">{faqForm.formState.errors.answer.message}</p>
                )}
              </div>
              <FormFooter onCancel={() => setShowForm(false)} isPending={isSaving} />
            </form>
          )}

          {addTab === 'url' && (
            <form onSubmit={urlForm.handleSubmit((d) => addURL.mutate({ agentId, ...d }))} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">URL da página</label>
                <input
                  {...urlForm.register('url')}
                  type="url"
                  placeholder="https://suaempresa.com/sobre"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {urlForm.formState.errors.url && (
                  <p className="mt-0.5 text-xs text-red-500">{urlForm.formState.errors.url.message}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O conteúdo da página será extraído e indexado automaticamente.
              </p>
              <FormFooter onCancel={() => setShowForm(false)} isPending={isSaving} />
            </form>
          )}

          {addTab === 'image' && (
            <form onSubmit={imageForm.handleSubmit((d) => addImage.mutate({ agentId, ...d }))} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Nome do produto</label>
                <input
                  {...imageForm.register('name')}
                  placeholder="Ex: Tênis Nike Air Max"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {imageForm.formState.errors.name && (
                  <p className="mt-0.5 text-xs text-red-500">{imageForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">URL da imagem</label>
                <input
                  {...imageForm.register('imageUrl')}
                  type="url"
                  placeholder="https://exemplo.com/foto-produto.jpg"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {imageForm.formState.errors.imageUrl && (
                  <p className="mt-0.5 text-xs text-red-500">{imageForm.formState.errors.imageUrl.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Descrição <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <textarea
                  {...imageForm.register('description')}
                  rows={2}
                  placeholder="Ex: Disponível em preto e branco, tamanhos 38 ao 44"
                  className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Quando o cliente perguntar sobre este produto, o agente enviará a imagem automaticamente.
              </p>
              <FormFooter onCancel={() => setShowForm(false)} isPending={isSaving} />
            </form>
          )}
        </div>
      )}

      {/* Sources list */}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-center">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">Nenhum conteúdo adicionado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Adicione textos, FAQs ou URLs para o agente usar nas respostas.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => {
            const type = typeConfig[source.type as keyof typeof typeConfig] ?? typeConfig.text
            const status = statusConfig[source.status as keyof typeof statusConfig] ?? statusConfig.pending
            const StatusIcon = status.icon
            const TypeIcon = type.icon
            const isProcessing = source.status === 'processing'

            const isEditing = editingId === source.id

            return (
              <div key={source.id} className="rounded-lg border bg-white">
                {isEditing ? (
                  <div className="p-3 space-y-2">
                    {source.type === 'text' && (
                      <>
                        <input
                          value={editFields.name ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Título"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <textarea
                          value={editFields.content ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, content: e.target.value }))}
                          rows={4}
                          placeholder="Conteúdo"
                          className="w-full resize-none rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </>
                    )}
                    {source.type === 'faq' && (
                      <>
                        <input
                          value={editFields.question ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, question: e.target.value }))}
                          placeholder="Pergunta"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <textarea
                          value={editFields.answer ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, answer: e.target.value }))}
                          rows={3}
                          placeholder="Resposta"
                          className="w-full resize-none rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </>
                    )}
                    {source.type === 'url' && (
                      <input
                        value={editFields.url ?? ''}
                        onChange={(e) => setEditFields((f) => ({ ...f, url: e.target.value }))}
                        placeholder="URL"
                        className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    )}
                    {source.type === 'image' && (
                      <>
                        <input
                          value={editFields.name ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Nome do produto"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          value={editFields.imageUrl ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, imageUrl: e.target.value }))}
                          placeholder="URL da imagem"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          value={editFields.description ?? ''}
                          onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
                          placeholder="Descrição (opcional)"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(source)}
                        disabled={updateSource.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                      >
                        {updateSource.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${type.color}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{source.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${status.class}`}>
                          <StatusIcon className={`h-3 w-3 ${isProcessing ? 'animate-spin' : ''}`} />
                          {status.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{type.label}</span>
                      </div>
                      {source.status === 'error' && (source as any).error_message && (
                        <p className="mt-0.5 text-xs text-red-500 truncate">{(source as any).error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(source)}
                        title="Editar"
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {source.status === 'error' && (
                        <button
                          onClick={() => reprocess(source.id)}
                          title="Reprocessar"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSource.mutate({ id: source.id })}
                        disabled={deleteSource.isPending}
                        title="Remover"
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {sources.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {sources.filter((s) => s.status === 'ready').length} de {sources.length} fontes prontas
        </p>
      )}
    </div>
  )
}

function FormFooter({ onCancel, isPending }: { onCancel: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {isPending ? 'Processando...' : 'Salvar e indexar'}
      </button>
    </div>
  )
}
