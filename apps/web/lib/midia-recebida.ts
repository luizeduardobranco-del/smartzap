// Cópia das mídias recebidas no WhatsApp (imagem, áudio, vídeo, documento, figurinha).
//
// O `url` que a Evolution manda no webhook aponta para o CDN do WhatsApp (mmg.whatsapp.net):
// o arquivo é criptografado e o link expira, então o painel não consegue exibir. Baixamos o
// conteúdo já decifrado (getBase64FromMediaMessage) e guardamos no bucket privado
// `chat-media`. Em `messages.media_url` fica a referência `storage:chat-media/<caminho>`;
// o painel abre pela rota /api/media/<id da mensagem>, que confere o acesso (RLS) e
// repassa o arquivo sem nunca expor o endereço do banco. Guardado por 30 dias.

export const BUCKET_MIDIA = 'chat-media'
/** Por quanto tempo o arquivo fica guardado (o cron /api/cron/limpar-midias apaga depois). */
export const DIAS_RETENCAO_MIDIA = 30
export const PREFIXO_STORAGE = `storage:${BUCKET_MIDIA}/`

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'application/pdf': 'pdf',
}

/** Tipo da mensagem na Evolution para baixar a mídia, ou null se não há arquivo. */
export function tipoMidiaEvolution(contentType: string):
  'imageMessage' | 'audioMessage' | 'documentMessage' | 'videoMessage' | 'stickerMessage' | null {
  switch (contentType) {
    case 'image': return 'imageMessage'
    case 'audio': return 'audioMessage'
    case 'document': return 'documentMessage'
    case 'video': return 'videoMessage'
    case 'sticker': return 'stickerMessage'
    default: return null
  }
}

function extensao(mimetype: string | undefined, filename?: string): string {
  const base = (mimetype ?? '').split(';')[0].trim().toLowerCase()
  if (EXTENSOES[base]) return EXTENSOES[base]
  const doNome = filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1]
  if (doNome) return doNome.toLowerCase()
  const sub = base.split('/')[1]
  return sub && /^[a-z0-9]{1,5}$/.test(sub) ? sub : 'bin'
}

/**
 * Guarda a mídia no Storage e devolve a referência para `messages.media_url`
 * (ou null se falhar — a mensagem continua gravada, só sem arquivo).
 */
export async function guardarMidiaRecebida(
  supabase: any,
  args: { organizationId: string; messageId: string; base64: string; mimetype?: string; filename?: string },
): Promise<string | null> {
  try {
    const mime = (args.mimetype ?? 'application/octet-stream').split(';')[0].trim()
    const mes = new Date().toISOString().slice(0, 7)
    const caminho = `${args.organizationId}/${mes}/${args.messageId}.${extensao(args.mimetype, args.filename)}`
    const bytes = Buffer.from(args.base64, 'base64')
    const { error } = await supabase.storage.from(BUCKET_MIDIA).upload(caminho, bytes, {
      contentType: mime, upsert: true,
    })
    if (error) {
      console.warn('[midia] upload falhou:', error.message)
      return null
    }
    return PREFIXO_STORAGE + caminho
  } catch (err) {
    console.warn('[midia] erro ao guardar:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Caminho dentro do bucket, se a referência for do nosso Storage. */
export function caminhoNoStorage(mediaUrl: string | null | undefined): string | null {
  return mediaUrl?.startsWith(PREFIXO_STORAGE) ? mediaUrl.slice(PREFIXO_STORAGE.length) : null
}
