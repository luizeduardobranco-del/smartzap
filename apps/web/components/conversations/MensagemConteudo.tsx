'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Image as ImageIcon, FileText, X, ZoomIn, ZoomOut, RotateCw, RotateCcw, Maximize } from 'lucide-react'

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

const ZOOM_MIN = 1
const ZOOM_MAX = 6

// Popup para ver imagem/documento sem sair do painel (não abre aba com endereço nenhum).
// Imagem: zoom (botões, roda do mouse, duplo clique, teclas + e -), arrastar quando
// ampliada, girar 90° (teclas R / Shift+R) e voltar ao original (tecla 0).
function MidiaPopup({ midia, onClose }: { midia: { src: string; tipo: 'image' | 'document' }; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [giro, setGiro] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const aplicarZoom = useCallback((z: number) => {
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
    setZoom(novo)
    if (novo === 1) setPos({ x: 0, y: 0 })
  }, [])
  const girar = useCallback((graus: number) => setGiro((g) => g + graus), [])
  const resetar = useCallback(() => { setZoom(1); setGiro(0); setPos({ x: 0, y: 0 }) }, [])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (midia.tipo !== 'image') return
      if (e.key === '+' || e.key === '=') aplicarZoom(zoom * 1.25)
      else if (e.key === '-') aplicarZoom(zoom / 1.25)
      else if (e.key === 'r') girar(90)
      else if (e.key === 'R') girar(-90)
      else if (e.key === '0') resetar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose, midia.tipo, zoom, aplicarZoom, girar, resetar])

  const botao = 'rounded-md bg-white/15 p-1.5 text-white hover:bg-white/25 disabled:opacity-40 disabled:hover:bg-white/15'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/85" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        {midia.tipo === 'image' && (
          <>
            <button onClick={() => aplicarZoom(zoom / 1.25)} disabled={zoom <= ZOOM_MIN} className={botao} title="Diminuir (−)" aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></button>
            <span className="w-12 text-center text-xs tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
            <button onClick={() => aplicarZoom(zoom * 1.25)} disabled={zoom >= ZOOM_MAX} className={botao} title="Ampliar (+)" aria-label="Ampliar zoom"><ZoomIn className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-white/20" />
            <button onClick={() => girar(-90)} className={botao} title="Girar para a esquerda (Shift+R)" aria-label="Girar para a esquerda"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={() => girar(90)} className={botao} title="Girar para a direita (R)" aria-label="Girar para a direita"><RotateCw className="h-4 w-4" /></button>
            <button onClick={resetar} disabled={zoom === 1 && giro % 360 === 0} className={botao} title="Tamanho original (0)" aria-label="Tamanho original"><Maximize className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-white/20" />
          </>
        )}
        <a href={`${midia.src}?download=1`} className="rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25">Baixar</a>
        <button onClick={onClose} className={botao} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {midia.tipo === 'image' ? (
          <img
            src={midia.src}
            alt="Imagem"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => (zoom > 1 ? resetar() : aplicarZoom(2.5))}
            onWheel={(e) => aplicarZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
            onPointerDown={(e) => {
              if (zoom <= 1) return
              e.currentTarget.setPointerCapture(e.pointerId)
              arrasto.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
            }}
            onPointerMove={(e) => {
              const a = arrasto.current
              if (a) setPos({ x: a.px + (e.clientX - a.x), y: a.py + (e.clientY - a.y) })
            }}
            onPointerUp={() => { arrasto.current = null }}
            onPointerCancel={() => { arrasto.current = null }}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom}) rotate(${giro}deg)`,
              transition: arrasto.current ? 'none' : 'transform 150ms ease-out',
              cursor: zoom > 1 ? (arrasto.current ? 'grabbing' : 'grab') : 'zoom-in',
              touchAction: 'none',
            }}
            className="max-h-full max-w-full select-none rounded-lg object-contain"
          />
        ) : (
          <iframe src={midia.src} title="Documento" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-4xl rounded-lg bg-white" />
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
