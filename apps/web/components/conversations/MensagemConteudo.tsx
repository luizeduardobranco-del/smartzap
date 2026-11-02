'use client'

import { useEffect, useState } from 'react'
import { Mic, Image as ImageIcon, FileText, X } from 'lucide-react'

// Conteúdo de uma mensagem (texto, imagem, áudio com player, vídeo, documento, reação).
// Usado na tela de Conversas e no popup de atendimento humano (LeadDetailModal), para as
// duas mostrarem a mídia do mesmo jeito.

export type MsgComMidia = {
  id: string
  content: string | null
  content_type: string | null
  media_url: string | null
  created_at: string
}

// Mídias são guardadas por 30 dias (cron /api/cron/limpar-midias).
const DIAS_RETENCAO_MIDIA = 30

// Endereço para exibir a mídia. Tudo que é nosso (cópia no Storage e os vídeos/folders que
// o agente envia) passa pela rota autenticada /api/media/<id>: o endereço do banco nunca
// chega ao navegador. O link do CDN do WhatsApp (mmg.whatsapp.net) é criptografado e não
// abre, então é ignorado.
function srcMidia(msg: MsgComMidia): string | null {
  const u = msg.media_url
  if (!u) return null
  if (u.startsWith('storage:') || /supabase\.co\/storage\//.test(u)) return `/api/media/${msg.id}`
  if (/^https?:\/\//.test(u) && !/whatsapp\.net/.test(u)) return u
  return null
}

function midiaExpirada(msg: MsgComMidia): boolean {
  return !msg.media_url && Date.now() - new Date(msg.created_at).getTime() > DIAS_RETENCAO_MIDIA * 86_400_000
}

function avisoSemArquivo(msg: MsgComMidia, tipo: string): string {
  return midiaExpirada(msg) ? `${tipo} expirado(a) — guardamos por ${DIAS_RETENCAO_MIDIA} dias` : `${tipo} (arquivo não disponível)`
}

// Texto real da mensagem (legenda, transcrição), sem os marcadores "[mídia]", "[imagem: x]"…
function textoMidia(content: string | null): boolean {
  return !!content && !/^\[(mídia|figurinha|imagem:[^\]]*|video:[^\]]*)\]$/i.test(content.trim())
}

// Popup para ver imagem/documento sem sair do painel (não abre aba com endereço nenhum).
function MidiaPopup({ midia, onClose }: { midia: { src: string; tipo: 'image' | 'document' }; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="relative flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-full justify-end gap-2">
          <a href={`${midia.src}?download=1`} className="rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25">Baixar</a>
          <button onClick={onClose} className="rounded-md bg-white/15 p-1.5 text-white hover:bg-white/25" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        {midia.tipo === 'image' ? (
          <img src={midia.src} alt="Imagem" className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" />
        ) : (
          <iframe src={midia.src} title="Documento" className="h-[85vh] w-[90vw] max-w-4xl rounded-lg bg-white" />
        )}
      </div>
    </div>
  )
}

export function MensagemConteudo({ msg, isUser }: { msg: MsgComMidia; isUser: boolean }) {
  const [popup, setPopup] = useState<{ src: string; tipo: 'image' | 'document' } | null>(null)
  const src = srcMidia(msg)
  const legenda = textoMidia(msg.content)
  const tipo = msg.content_type

  let corpo: React.ReactNode
  if (tipo === 'audio') {
    corpo = (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-primary/10' : 'bg-white/20'}`}>
            <Mic className={`h-3.5 w-3.5 ${isUser ? 'text-primary' : 'text-white'}`} />
          </div>
          <span className={`text-xs font-medium ${isUser ? 'text-muted-foreground' : 'text-white/80'}`}>Áudio</span>
        </div>
        {src ? (
          <audio controls preload="none" src={src} className="h-9 w-64 max-w-full" />
        ) : midiaExpirada(msg) ? (
          <p className={`text-[11px] ${isUser ? 'text-muted-foreground' : 'text-white/60'}`}>Áudio expirado — guardamos por {DIAS_RETENCAO_MIDIA} dias</p>
        ) : null}
        {legenda ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap italic opacity-90">"{msg.content}"</p>
        ) : (
          <p className={`text-xs italic ${isUser ? 'text-muted-foreground' : 'text-white/60'}`}>Áudio não transcrito</p>
        )}
      </div>
    )
  } else if (tipo === 'image') {
    corpo = (
      <div className="space-y-1.5">
        {src ? (
          <button type="button" onClick={() => setPopup({ src, tipo: 'image' })} title="Ampliar imagem" className="block">
            <img src={src} alt="Imagem" loading="lazy" className="max-w-full rounded-lg max-h-64 object-cover cursor-zoom-in" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 opacity-70" />
            <span className="text-xs opacity-70">{avisoSemArquivo(msg, 'Imagem')}</span>
          </div>
        )}
        {legenda && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
      </div>
    )
  } else if (tipo === 'video') {
    corpo = (
      <div className="space-y-1.5">
        {src ? (
          <video controls preload="metadata" src={src} className="max-w-full rounded-lg max-h-64" />
        ) : (
          <span className="text-xs opacity-70">{avisoSemArquivo(msg, 'Vídeo')}</span>
        )}
        {legenda && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
      </div>
    )
  } else if (tipo === 'document') {
    corpo = src ? (
      <button type="button" onClick={() => setPopup({ src, tipo: 'document' })} className="flex items-center gap-2 text-left underline-offset-2 hover:underline">
        <FileText className="h-4 w-4 opacity-70" />
        <span className="text-sm">{legenda ? msg.content : 'Abrir documento'}</span>
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 opacity-70" />
        <span className="text-sm">{legenda ? msg.content : avisoSemArquivo(msg, 'Documento')}</span>
      </div>
    )
  } else if (/^\[reação: .+\]$/.test(msg.content ?? '')) {
    corpo = (
      <p className="text-sm" title="Reagiu a uma mensagem">
        <span className="text-xl leading-none">{msg.content!.slice(9, -1)}</span>
        <span className="ml-1.5 text-xs opacity-70">reagiu</span>
      </p>
    )
  } else {
    corpo = <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
  }

  return (
    <>
      {corpo}
      {popup && <MidiaPopup midia={popup} onClose={() => setPopup(null)} />}
    </>
  )
}
