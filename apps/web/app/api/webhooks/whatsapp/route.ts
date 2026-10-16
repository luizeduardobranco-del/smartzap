import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'
import { runAgent } from '@zapagent/ai-engine'
import { garagemEnabled, handleGaragemNfImage, handleGaragemNfText, lerChaveCodigoBarras, lerChaveEmBlocos, extractNf } from '@/lib/garagem-nf'
import { grupoNoEscopo, transcreverAudioGrupo, classificarImagemGrupo, logGrupoGaragem } from '@/lib/garagem-grupo'
import { grupoSmNoEscopo, enviarNotaParaSm, chaveNoTexto, lerCanhoto, enviarCanhotoParaViagem } from '@/lib/sm-nota-grupo'
import { grupoClienteNoEscopo, interpretarPedido, enviarPedidoGrupo, destinoPropostaJid, respostaConfirmacao } from '@/lib/garagem-pedido'
import { grupoAbastecimentoNoEscopo, lerImagemAbastecimento, enviarAbastecimentoGrupo, statusAbastecimentoGrupo, marcarTanqueAbast } from '@/lib/abastecimento-grupo'
import { findOrCreateOpenConversation } from '@/lib/conversations'
import { tratarRespostaAgenda } from '@/lib/agenda/confirmacao-inbound'
import { avisarDesconexao, avisarReconexao } from '@/lib/alerta-desconexao'
import { midiasPorTexto, precisaResumo, extrairResumo } from '@/lib/agente-garantias'
import { centralAtiva, repassarEntrada, repassarSaida, anotarMensagem, tipoCentral, RespostaCentral } from '@/lib/central-rotograma'

// Declarado NO CÓDIGO, não em apps/web/vercel.json: o projeto tem rootDirectory
// nulo, então a Vercel lê o vercel.json da raiz e ignora o de apps/web — o
// maxDuration que estava lá nunca foi aplicado. Esta rota dorme 8s de debounce
// antes de chamar a IA, então o limite padrão a mata no meio.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const evolutionParseAdapter = new EvolutionWhatsAppAdapter('', '', '')
const metaParseAdapter = new MetaCloudWhatsAppAdapter('', '')

export async function POST(request: NextRequest) {
  const payload = await request.json()
  try {
    await handleWebhook(payload)
  } catch (err) {
    console.error('[webhook/whatsapp]', err instanceof Error ? err.message : err)
  }
  return NextResponse.json({ ok: true })
}

// ── Meta Cloud API webhook verification (GET) ─────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === (process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'whitezap')) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

async function handleWebhook(payload: unknown) {
  const p = payload as Record<string, unknown>

  // ── Detect provider: Meta Cloud API vs Evolution ───────────────────────────
  const isMetaCloud = p?.object === 'whatsapp_business_account'

  if (isMetaCloud) {
    await handleMetaWebhook(payload)
    return
  }

  // ── Evolution flow (existing) ──────────────────────────────────────────────
  console.log('[webhook] event:', p?.event, 'instance:', p?.instance)

  // CONNECTION_UPDATE: track channel connectivity
  if (p?.event === 'connection.update' || p?.event === 'CONNECTION_UPDATE') {
    await handleConnectionUpdate(p)
    return
  }

  const msg = evolutionParseAdapter.parseWebhook(payload)
  if (!msg) {
    console.log('[webhook] parseWebhook returned null — skipping')
    return
  }

  console.log('[webhook] msg parsed:', { channelIdentifier: msg.channelIdentifier, senderExternalId: msg.senderExternalId, contentType: msg.contentType, text: msg.text?.slice(0, 50) })

  const supabase = getSupabase()

  // 1. Find channel by instanceName
  const { data: channelRows, error: channelErr } = await supabase
    .from('channels')
    .select('id, organization_id, agent_id, status')
    .eq('type', 'whatsapp')
    .filter('credentials->>instanceName', 'eq', msg.channelIdentifier)
    .limit(1)

  if (channelErr) console.error('[webhook] channel query error:', channelErr.message)
  console.log('[webhook] channel rows:', JSON.stringify(channelRows))

  const channel = channelRows?.[0]
  if (!channel) {
    console.warn(`[webhook] No channel found for instance: ${msg.channelIdentifier}`)
    return
  }
  if (!channel.agent_id) {
    console.warn(`[webhook] Channel found but no agent_id for instance: ${msg.channelIdentifier}`)
    return
  }

  console.log('[webhook] channel found:', channel.id, 'status:', channel.status, 'agent:', channel.agent_id)

  // Auto-promote connecting → connected when first message arrives
  if (channel.status === 'connecting') {
    await supabase
      .from('channels')
      .update({ status: 'connected', connected_at: new Date().toISOString() })
      .eq('id', channel.id)
    console.log('[webhook] channel promoted to connected')
  }

  // 2. Check credits
  const { data: org } = await supabase
    .from('organizations')
    .select('id, slug, credits_balance, settings')
    .eq('id', channel.organization_id)
    .single()

  if (!org || org.credits_balance <= 0) {
    console.warn(`[webhook] No credits for org: ${channel.organization_id} balance: ${org?.credits_balance}`)
    return
  }

  console.log('[webhook] credits ok:', org.credits_balance)

  // 2b. Garagem — ESCUTA DE GRUPO (modo teste): captura tudo e registra, sem responder.
  // Só para a org da garagem; outras orgs continuam ignorando mensagens de grupo.
  if (msg.isGroup) {
    // Nota da FROTA → SM da gerenciadora. Estes grupos recebem a nota do que o
    // caminhão está levando; a mesma foto no fluxo do pátio viraria agendamento
    // de entrada, que é outro processo. Por isso vem primeiro e encerra aqui.
    if (garagemEnabled(org) && grupoSmNoEscopo(msg.groupJid)) {
      try {
        const openaiKeySm = process.env.OPENAI_API_KEY
        let chave: string | null = chaveNoTexto(msg.text)

        if (!chave && msg.contentType === 'image') {
          const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage', msg.groupJid)
          if (media?.base64) {
            // Mesma escada do pátio, do mais confiável para o menos: código de
            // barras → leitura direta da chave → leitura em blocos de 4 dígitos.
            chave = await lerChaveCodigoBarras(media.base64)
            if (!chave && openaiKeySm) {
              const campos = await extractNf(openaiKeySm, media.base64, media.mimetype ?? null)
              if (campos?.chaveAcesso && campos.chaveAcesso.length === 44) chave = campos.chaveAcesso
            }
            if (!chave && openaiKeySm) chave = await lerChaveEmBlocos(openaiKeySm, media.base64, media.mimetype ?? null)
          }
        }

        // MODO ESCUTA (padrão): lê a nota, lança na viagem e monta a prévia da SM,
        // mas NÃO fala no grupo. A automação da SM ainda está sendo acertada com a
        // Golden, e robô respondendo no grupo da frota vira ordem de serviço para o
        // motorista antes da hora. Ligar as respostas: SM_RESPONDER_GRUPO=on.
        const responderNoGrupo = (process.env.SM_RESPONDER_GRUPO ?? '').trim().toLowerCase() === 'on'
        const falar = async (texto: string) => {
          if (!responderNoGrupo || !msg.groupJid) return
          const adpSm = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
          await adpSm.sendMessage({
            channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier,
            recipientExternalId: msg.groupJid, contentType: 'text', text: texto,
          })
        }

        if (chave) {
          const out = await enviarNotaParaSm({
            chave,
            grupoJid: msg.groupJid,
            telefone: msg.senderExternalId,
            remetente: msg.senderName ?? null,
          })
          if (out.reply) await falar(out.reply)
          console.log('[webhook] nota->SM', chave.slice(-6), out.viagem ?? 'sem viagem', responderNoGrupo ? '(respondeu)' : '(modo escuta)')
        } else if (msg.contentType === 'image') {
          // Sem chave de acesso, a foto ainda pode ser um CANHOTO — o comprovante
          // de entrega que o motorista manda depois de descarregar. Ele não tem
          // chave; o que identifica a carga é o número da nota, impresso no centro
          // e, mais confiável, nos 9 últimos dígitos da numeração do código de
          // barras à direita.
          let tratado = false
          const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage', msg.groupJid)
          if (media?.base64 && openaiKeySm) {
            const c = await lerCanhoto(openaiKeySm, media.base64, media.mimetype ?? null)
            if (c?.ehCanhoto && (c.nfNumero || c.codigoBarras)) {
              const out = await enviarCanhotoParaViagem({
                nfNumero: c.nfNumero, codigoBarras: c.codigoBarras,
                fotoBase64: media.base64, mime: media.mimetype ?? null,
                grupoJid: msg.groupJid, telefone: msg.senderExternalId,
                remetente: msg.senderName ?? null, legenda: msg.text ?? null,
              })
              if (out.reply) await falar(out.reply)
              console.log('[webhook] canhoto->viagem', c.codigoBarras?.slice(-9) || c.nfNumero, out.viagem ?? 'sem viagem', responderNoGrupo ? '(respondeu)' : '(modo escuta)')
              tratado = true
            }
          }
          if (!tratado) {
            await falar('⚠️ Não consegui ler a *chave de acesso* dessa nota. Manda a foto do DANFE com o código de barras nítido, ou cola aqui os 44 dígitos da chave.')
            console.log('[webhook] nota->SM: chave não lida e não é canhoto', responderNoGrupo ? '(avisou)' : '(modo escuta)')
          }
        }
      } catch (err) {
        console.error('[webhook] nota->SM erro:', err instanceof Error ? err.message : err)
      }
      return // grupo da frota tratado — não segue para o fluxo do pátio
    }

    // Robô de ABASTECIMENTO — grupo dedicado: lê placa/tacógrafo/bomba/NF e grava no rotograma.
    if (garagemEnabled(org) && grupoAbastecimentoNoEscopo(msg.groupJid)) {
      try {
        const openaiKeyA = process.env.OPENAI_API_KEY
        // Motorista responde CHEIO / PARCIAL → marca o último abastecimento dele.
        const txt = (msg.text ?? '').trim().toLowerCase()
        if (msg.contentType === 'text' && /^(parcial|tanque parcial|cheio|tanque cheio)$/.test(txt)) {
          const out = await marcarTanqueAbast(msg.senderExternalId, /cheio/.test(txt))
          if (out?.reply && msg.groupJid) {
            const adp = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
            await adp.sendMessage({ channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier, recipientExternalId: msg.groupJid, contentType: 'text', text: out.reply })
          }
          return
        }
        if (msg.contentType === 'image' && openaiKeyA) {
          const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage', msg.groupJid)
          if (media?.base64) {
            const leitura = await lerImagemAbastecimento(openaiKeyA, media.base64, media.mimetype ?? null)
            if (leitura && leitura.tipo !== 'outro') {
              const out = await enviarAbastecimentoGrupo({
                grupoJid: msg.groupJid, remetente: msg.senderExternalId, remetenteNome: msg.senderName ?? null,
                leitura, fotoBase64: media.base64, fotoMime: media.mimetype ?? null,
              })
              if (out?.reply && msg.groupJid) {
                const adp = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
                const postar = (text: string) => adp.sendMessage({ channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier, recipientExternalId: msg.groupJid!, contentType: 'text', text })
                if (out.acao === 'gravado') {
                  // Concluído: responde na hora.
                  await postar(out.reply)
                } else {
                  // Incompleto/divergência: aguarda a JANELA DE SILÊNCIO e só cobra se
                  // NENHUMA foto nova chegou nesse intervalo (evita várias mensagens em sequência).
                  const ABAST_QUIET_MS = 25000
                  const myTs = out.updatedAt ?? null
                  const reply = out.reply
                  const remetente = msg.senderExternalId
                  await new Promise((r) => setTimeout(r, ABAST_QUIET_MS))
                  const st = await statusAbastecimentoGrupo(remetente)
                  const semNovidade = !!st && st.status === 'aberto' && !!st.updatedAt && !!myTs &&
                    new Date(st.updatedAt).getTime() <= new Date(myTs).getTime()
                  if (semNovidade) await postar(reply)
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[webhook] abastecimento grupo erro:', err instanceof Error ? err.message : err)
      }
      return // grupo de abastecimento tratado
    }

    // Grupo do CLIENTE (ICONIC × Ativa): aqui o cliente PEDE carros por texto.
    // O robô LÊ o pedido e publica a proposta no grupo INTERNO — nunca responde
    // neste grupo, onde só entram as notificações de saída e os relatórios.
    // Também não cai no fluxo do pátio (foto aqui não registra movimento).
    if (garagemEnabled(org) && grupoClienteNoEscopo(msg.groupJid)) {
      try {
        const openaiKeyP = process.env.OPENAI_API_KEY
        let frase: string | null = msg.contentType === 'text' ? (msg.text ?? null) : null
        if (msg.contentType === 'audio' && openaiKeyP) {
          const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'audioMessage', msg.groupJid)
          if (media?.base64) frase = await transcreverAudioGrupo(openaiKeyP, media.base64, media.mimetype ?? null)
        }
        const destino = destinoPropostaJid()
        if (frase && openaiKeyP && destino) {
          const intencao = await interpretarPedido(openaiKeyP, frase)
          // Só o PEDIDO vem do cliente; confirmar/cancelar é decisão da Ativa,
          // feita no grupo interno (senão o robô teria de responder aqui).
          if (intencao?.acao === 'solicitar') {
            const out = await enviarPedidoGrupo({
              intencao, grupoJid: msg.groupJid,
              remetente: msg.senderExternalId, remetenteNome: msg.senderName ?? null, texto: frase,
            })
            if (out?.reply) {
              const adp = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
              await adp.sendMessage({
                channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier,
                recipientExternalId: destino, contentType: 'text',
                text: `📣 *Pedido do cliente no grupo da ICONIC*\n_"${frase}"_${msg.senderName ? ` — ${msg.senderName}` : ''}\n\n${out.reply}`,
              })
              console.log('[webhook] garagem pedido publicado no grupo interno')
            }
          }
        }
      } catch (err) {
        console.error('[webhook] garagem pedido grupo erro:', err instanceof Error ? err.message : err)
      }
      return // grupo do cliente tratado (sem resposta neste grupo)
    }

    if (!garagemEnabled(org) || !grupoNoEscopo(msg.groupJid)) return

    // CONFIRMA / CANCELA de um pedido do cliente que está aguardando decisão.
    // Reconhecido por texto exato (sem custo de IA) e tratado antes do fluxo de
    // fotos — se não for uma dessas palavras, segue tudo como antes.
    if (msg.contentType === 'text') {
      const decisao = respostaConfirmacao(msg.text ?? null)
      if (decisao) {
        try {
          const out = await enviarPedidoGrupo({
            intencao: { acao: decisao, quantidade: null, produto: null, placas: [] },
            grupoJid: msg.groupJid, remetente: msg.senderExternalId,
            remetenteNome: msg.senderName ?? null, texto: msg.text ?? null,
          })
          if (out?.reply && msg.groupJid) {
            const adp = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
            await adp.sendMessage({
              channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier,
              recipientExternalId: msg.groupJid, contentType: 'text', text: out.reply,
            })
            console.log('[webhook] garagem pedido:', decisao)
            return
          }
        } catch (err) {
          console.error('[webhook] garagem confirmacao erro:', err instanceof Error ? err.message : err)
        }
      }
    }

    try {
      const openaiKeyG = process.env.OPENAI_API_KEY
      // Legenda da foto (caption) — sinal de intenção "chegando/saindo" que o
      // colaborador escreve junto da imagem. Preserva ANTES de sobrescrever conteudo.
      const legenda: string | null = msg.contentType === 'image' ? (msg.text ?? null) : null
      let conteudo: string | null = msg.text ?? null
      let classificacao: string | null = null
      let fotoBase64: string | null = null
      let fotoMime: string | null = null
      let replyNf: string | null = null   // resposta da leitura da NF no grupo

      if (msg.contentType === 'audio' && openaiKeyG) {
        const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'audioMessage', msg.groupJid)
        if (media?.base64) conteudo = await transcreverAudioGrupo(openaiKeyG, media.base64, media.mimetype ?? null)
      } else if (msg.contentType === 'image' && openaiKeyG) {
        const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage', msg.groupJid)
        if (media?.base64) {
          fotoBase64 = media.base64
          fotoMime = media.mimetype ?? null
          const cls = await classificarImagemGrupo(openaiKeyG, media.base64, fotoMime)
          // 'falha_leitura' = o serviço de visão não respondeu (sem crédito,
          // chave inválida, fora do ar). A foto é arquivada e o rotograma avisa
          // no grupo — nunca mais fica em silêncio.
          if (cls) { classificacao = cls.tipo; if (cls.tipo !== 'falha_leitura') conteudo = cls.resumo || conteudo }
          // NOTA FISCAL no grupo: lê e REGISTRA (mesma via oficial do privado — chave por
          // código de barras/IA → Meu Danfe) e devolve o resumo p/ publicar no grupo.
          if (classificacao === 'nota_fiscal') {
            const nfOut = await handleGaragemNfImage({ openaiKey: openaiKeyG, base64: media.base64, mime: fotoMime, telefone: msg.senderExternalId })
            if (nfOut?.reply) replyNf = nfOut.reply
          }
        }
      }

      const outGrupo = await logGrupoGaragem({
        grupoJid: msg.groupJid,
        remetente: msg.senderExternalId,
        remetenteNome: msg.senderName ?? null,
        tipo: msg.contentType,
        conteudo,
        classificacao,
        legenda,
        fotoBase64,
        fotoMime,
      })
      // Publica no grupo: confirmação de entrada/saída (placa) OU o resumo da NF lida.
      const replyGrupo = outGrupo?.reply || replyNf
      if (replyGrupo && msg.groupJid) {
        const grpAdapter = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
        await grpAdapter.sendMessage({
          channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier,
          recipientExternalId: msg.groupJid, contentType: 'text', text: replyGrupo,
        })
        console.log('[webhook] garagem grupo: resposta publicada no grupo')
      }
      console.log('[webhook] garagem grupo capturado:', msg.groupJid, msg.contentType)
    } catch (err) {
      console.error('[webhook] garagem grupo erro:', err instanceof Error ? err.message : err)
    }
    return // MODO ESCUTA: nunca responde no grupo
  }

  // 3. Upsert contact
  let contactId: string
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('organization_id', channel.organization_id)
    .eq('channel_type', 'whatsapp')
    .eq('external_id', msg.senderExternalId)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
    if (msg.senderName && !existingContact.name) {
      await supabase.from('contacts').update({ name: msg.senderName }).eq('id', contactId)
    }
    console.log('[webhook] contact existing:', contactId)
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: channel.organization_id,
        external_id: msg.senderExternalId,
        channel_type: 'whatsapp',
        name: msg.senderName ?? msg.senderExternalId,
        phone: msg.senderExternalId,
      })
      .select('id')
      .single()
    if (!newContact) { console.error('[webhook] contact insert failed:', contactErr?.message); return }
    contactId = newContact.id
    console.log('[webhook] contact created:', contactId)
  }

  // 4. Find or create open conversation
  const conv = await findOrCreateOpenConversation(supabase, {
    organizationId: channel.organization_id,
    contactId,
    channelId: channel.id,
    agentId: channel.agent_id,
    mode: 'ai',
  })
  if (!conv) { console.error('[webhook] conversation resolve failed'); return }
  const conversationId = conv.id
  const conversationMode = conv.mode
  console.log('[webhook] conversation:', conversationId, 'mode:', conversationMode)

  // 5. Save incoming message
  const { data: savedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      organization_id: channel.organization_id,
      role: 'user',
      content: msg.text ?? '[mídia]',
      content_type: msg.contentType,
      media_url: msg.mediaUrl ?? null,
      sender_type: 'contact',
      external_id: msg.externalId,
    })
    .select('id, created_at')
    .single()

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // 5b. Central do Motorista (rotograma da Ativa Rio). Só para as instâncias em
  // CENTRAL_ROTOGRAMA_INSTANCIAS: a mensagem vai, com a mídia, para o rotograma,
  // que é quem diz se o robô pode responder (a torre pode ter assumido por lá).
  const usaCentral = !msg.isGroup && centralAtiva(msg.channelIdentifier)
  let central: RespostaCentral | null = null
  if (usaCentral) {
    const tipoMidia = msg.contentType === 'image' ? 'imageMessage'
      : msg.contentType === 'audio' ? 'audioMessage'
        : msg.contentType === 'document' ? 'documentMessage' : null
    const midia = tipoMidia
      ? await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, tipoMidia)
      : null
    central = await repassarEntrada({
      instancia: msg.channelIdentifier,
      telefone: msg.senderExternalId,
      nome: msg.senderName ?? null,
      tipo: tipoCentral(msg.contentType),
      texto: msg.text ?? null,
      externoId: msg.externalId,
      em: msg.timestamp,
      midiaBase64: midia?.base64 ?? null,
      mime: midia?.mimetype ?? msg.mimeType ?? null,
      nomeArquivo: msg.filename ?? null,
    })
    if (central?.roboPodeResponder === false) {
      console.log('[webhook] central: a torre está com a conversa, robô calado')
      return
    }
    if (central && !central.conhecido && central.sugestao) {
      // Número fora do cadastro de motoristas: avisa uma vez e não conversa
      const { count: jaRespondeu } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId).eq('role', 'assistant')
      if (!jaRespondeu) {
        const aviso = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, msg.channelIdentifier)
        const env = await aviso.sendMessage({
          channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier,
          recipientExternalId: msg.senderExternalId, contentType: 'text', text: central.sugestao,
        }).catch(() => null)
        await supabase.from('messages').insert({
          conversation_id: conversationId, organization_id: channel.organization_id,
          role: 'assistant', content: central.sugestao, content_type: 'text', sender_type: 'agent',
        })
        await repassarSaida({ instancia: msg.channelIdentifier, telefone: msg.senderExternalId, texto: central.sugestao, externoId: env?.externalId })
      }
      return
    }
    // A torre devolveu a conversa ao robô no rotograma: aqui ela volta para a IA também
    if (central && conversationMode === 'human') {
      await supabase.from('conversations').update({ mode: 'ai' }).eq('id', conversationId)
    }
  }

  // 6. Skip AI if human mode or document.
  // EXCEÇÃO: em orgs da garagem, o fluxo de NF (agendamento) precisa rodar MESMO em modo
  // humano — senão remetentes que foram notificados (garagem-alert coloca a conversa em
  // 'human') nunca mais conseguem agendar pelo robô. Só o agente GERAL respeita o human.
  // Na central do rotograma quem manda é o rotograma (5b): se ele liberou, o robô fala.
  const humanMode = conversationMode === 'human' && !(usaCentral && central?.roboPodeResponder)
  if (humanMode && !garagemEnabled(org)) { console.log('[webhook] mode=human, skipping AI'); return }
  if (!savedMsg) { console.log('[webhook] savedMsg null, skipping AI'); return }
  if (msg.contentType === 'document') { console.log('[webhook] document, skipping AI'); return }

  // 6e. Debounce: wait 8s, then check if a newer message arrived from the same contact.
  // This ensures consecutive messages are batched into a single AI response.
  const DEBOUNCE_MS = 8000
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS))

  const { data: newerMsgs } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .gte('created_at', savedMsg.created_at) // gte para pegar mesmo milissegundo
    .neq('id', savedMsg.id)                 // excluir a própria mensagem
    .limit(1)

  if (newerMsgs && newerMsgs.length > 0) {
    console.log('[webhook] debounce: newer message arrived, aborting — later request will handle AI')
    return
  }

  // All consecutive messages are now in DB. Find all unresponded user messages
  // (since the last assistant message) and combine into a single context.
  const { data: lastAssistant } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: pendingUserMsgs } = await supabase
    .from('messages')
    .select('content, content_type, created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .neq('content_type', 'document')
    .gt('created_at', lastAssistant?.created_at ?? '1970-01-01')
    .order('created_at', { ascending: true })

  // 6b. Handle audio — transcribe with Whisper
  // Declare effectiveText early so the batching block below can override it
  let effectiveText = msg.text

  const validPending = (pendingUserMsgs ?? []).filter((m) => m.content && m.content !== '[mídia]')
  if (validPending.length > 1) {
    // Multiple messages waiting — combine into single prompt
    effectiveText = validPending.map((m) => m.content).join('\n')
    console.log(`[webhook] debounce: batching ${validPending.length} messages → "${effectiveText.slice(0, 100)}"`)
  } else {
    console.log('[webhook] debounce: single message, proceeding normally')
  }

  // Resolve AI keys early (needed for media processing)
  const orgSettings = org.settings as Record<string, Record<string, string>> | null
  const aiKeys = orgSettings?.aiKeys ?? {}
  const openaiKey = aiKeys.openaiApiKey || process.env.OPENAI_API_KEY

  // Credit cost: text=1, audio=3, image=10
  let creditCost = 1
  if (msg.contentType === 'audio') {
    creditCost = 3
    if (!openaiKey) {
      console.warn('[webhook] audio: no OpenAI key for transcription, skipping AI')
      return
    }
    try {
      const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'audioMessage')
      if (media?.base64) {
        const audioBytes = Buffer.from(media.base64, 'base64')
        const fd = new FormData()
        fd.append('file', new Blob([audioBytes], { type: media.mimetype ?? 'audio/ogg' }), 'audio.ogg')
        fd.append('model', 'whisper-1')
        fd.append('language', 'pt')
        const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: fd,
        })
        if (tr.ok) {
          const { text: transcribed } = await tr.json()
          if (transcribed?.trim()) {
            effectiveText = transcribed.trim()
            console.log('[webhook] audio transcribed:', effectiveText!.slice(0, 100))
            // Save transcription back to message so operators can read it in the UI
            if (savedMsg?.id) {
              await supabase
                .from('messages')
                .update({ content: effectiveText })
                .eq('id', savedMsg.id)
            }
            if (usaCentral) {
              await anotarMensagem({ instancia: msg.channelIdentifier, externoId: msg.externalId, transcricao: effectiveText })
            }
          }
        } else {
          console.warn('[webhook] Whisper error:', tr.status)
        }
      }
    } catch (err) {
      console.warn('[webhook] audio transcription error:', err instanceof Error ? err.message : err)
    }
    if (!effectiveText) {
      console.warn('[webhook] audio: transcription empty, skipping AI')
      return
    }
  }

  // 6c-0. Agente com behavior_config.ignoreImages: não lê a imagem (nem cobra os 10
  // créditos da visão). Com legenda, segue como texto; sem legenda, fica só gravada.
  let ignorarImagem = false
  if (msg.contentType === 'image') {
    const { data: agentImg } = await supabase
      .from('agents').select('behavior_config').eq('id', channel.agent_id).maybeSingle()
    ignorarImagem = (agentImg?.behavior_config as any)?.ignoreImages === true
    if (ignorarImagem) console.log('[webhook] image: agente com ignoreImages, visão desligada')
  }

  // 6c. Handle image — vision via GPT-4o
  if (msg.contentType === 'image' && !ignorarImagem) {
    if (!openaiKey) {
      console.warn('[webhook] image: no OpenAI key for vision, skipping AI')
      return
    }

    // 6c-i. Garagem (Ativa Rio): se for foto de NF, registra no rotograma.
    if (garagemEnabled(org)) {
      try {
        const nfMedia = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage')
        if (nfMedia?.base64) {
          const nf = await handleGaragemNfImage({
            openaiKey,
            base64: nfMedia.base64,
            mime: nfMedia.mimetype ?? null,
            telefone: msg.senderExternalId,
            conversationId,
          })
          if (nf) {
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              organization_id: channel.organization_id,
              role: 'assistant',
              content: nf.reply,
              content_type: 'text',
              sender_type: 'agent',
            })
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
            const nfAdapter = new EvolutionWhatsAppAdapter(
              process.env.EVOLUTION_API_URL!,
              process.env.EVOLUTION_API_KEY!,
              msg.channelIdentifier
            )
            await nfAdapter.sendMessage({
              channelType: 'whatsapp',
              channelIdentifier: msg.channelIdentifier,
              recipientExternalId: msg.senderExternalId,
              contentType: 'text',
              text: nf.reply,
            })
            await supabase.from('organizations').update({ credits_balance: org.credits_balance - 10 }).eq('id', channel.organization_id)
            console.log('[webhook] garagem NF registrada via rotograma (10 credits)')
            return
          }
        }
      } catch (err) {
        console.error('[webhook] garagem NF image error:', err instanceof Error ? err.message : err)
        // cai no fluxo de visão genérico abaixo
      }
    }

    // Modo humano: só a garagem responde — não aciona o agente de visão genérico.
    if (humanMode) { console.log('[webhook] mode=human — sem agente de visão genérico'); return }

    try {
      const { data: agentVision } = await supabase
        .from('agents')
        .select('personality, ai_config, behavior_config')
        .eq('id', channel.agent_id)
        .single()
      if (!agentVision) return

      const { data: historyVision } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(10)
      const convHistoryVision = (historyVision ?? [])
        .reverse()
        .filter((m) => m.content !== '[mídia]')
        .slice(0, -1)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const p = agentVision.personality as Record<string, unknown>
      const systemPrompt = ((p?.systemPrompt as string) || (p?.instructions as string) || `Você é ${(p?.role as string) ?? 'um assistente virtual'}.`).trim()

      // Try to get image base64 from Evolution API
      const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage')

      const userContent: unknown[] = []
      if (media?.base64) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${media.mimetype ?? 'image/jpeg'};base64,${media.base64}` } })
      }
      userContent.push({ type: 'text', text: msg.text || (media?.base64 ? 'Descreva e responda conforme necessário.' : 'O usuário enviou uma imagem (não foi possível carregá-la).') })

      const visionMessages = [
        { role: 'system', content: systemPrompt },
        ...convHistoryVision.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
      ]

      const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: visionMessages, max_tokens: 1000 }),
      })

      if (!visionRes.ok) {
        const errBody = await visionRes.json().catch(() => ({}))
        console.error('[webhook] vision API error:', visionRes.status, errBody?.error?.message)
        return
      }

      const visionData = await visionRes.json()
      const aiContent: string = visionData.choices[0]?.message?.content ?? ''
      if (!aiContent) return

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: aiContent,
        content_type: 'text',
        sender_type: 'agent',
        ai_model: 'gpt-4o',
      })
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

      const sendAdapterVision = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        msg.channelIdentifier
      )
      await sendAdapterVision.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: msg.channelIdentifier,
        recipientExternalId: msg.senderExternalId,
        contentType: 'text',
        text: aiContent,
      })
      await supabase.from('organizations').update({ credits_balance: org.credits_balance - 10 }).eq('id', channel.organization_id)
      console.log('[webhook] image vision response sent (10 credits deducted)')
    } catch (err) {
      console.error('[webhook] image vision error:', err instanceof Error ? err.message : err)
    }
    return
  }

  // Skip if still no processable text
  if (!effectiveText) { console.log('[webhook] no text content, skipping AI'); return }

  // 6c-ii. Garagem (Ativa Rio): se houver uma NF aguardando confirmação deste
  // telefone, o "SIM"/correção vai para o rotograma em vez do agente normal.
  if (garagemEnabled(org)) {
    try {
      const nfText = await handleGaragemNfText({ telefone: msg.senderExternalId, texto: effectiveText })
      if (nfText) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          organization_id: channel.organization_id,
          role: 'assistant',
          content: nfText.reply,
          content_type: 'text',
          sender_type: 'agent',
        })
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
        const nfAdapter = new EvolutionWhatsAppAdapter(
          process.env.EVOLUTION_API_URL!,
          process.env.EVOLUTION_API_KEY!,
          msg.channelIdentifier
        )
        await nfAdapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: msg.channelIdentifier,
          recipientExternalId: msg.senderExternalId,
          contentType: 'text',
          text: nfText.reply,
        })
        await supabase.from('organizations').update({ credits_balance: org.credits_balance - 1 }).eq('id', channel.organization_id)
        console.log('[webhook] garagem NF confirmação tratada via rotograma')
        return
      }
    } catch (err) {
      console.error('[webhook] garagem NF text error:', err instanceof Error ? err.message : err)
      // cai no fluxo normal do agente abaixo
    }
  }

  // Modo humano: só a garagem responde — não roda automações nem o agente geral.
  if (humanMode) { console.log('[webhook] mode=human — sem agente geral'); return }

  // 6c-bis. Resposta a pedido de confirmação da Agenda ("sim" / "não").
  // Vem antes das automações de propósito: uma automação de palavra-chave em
  // "sim" roubaria a resposta e a cadeira continuaria reservada.
  try {
    const agendaReply = await tratarRespostaAgenda({
      supabase,
      organizationId: channel.organization_id,
      contactId,
      texto: effectiveText ?? '',
    })
    if (agendaReply) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: agendaReply.reply,
        content_type: 'text',
        sender_type: 'agenda',
      })
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

      const agendaAdapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        msg.channelIdentifier
      )
      await agendaAdapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: msg.channelIdentifier,
        recipientExternalId: msg.senderExternalId,
        contentType: 'text',
        text: agendaReply.reply,
      })
      console.log('[webhook] agenda: confirmação tratada')
      return
    }
  } catch (err) {
    console.error('[webhook] agenda confirmação error:', err instanceof Error ? err.message : err)
    // segue o fluxo normal do agente
  }

  // 6d. Run automations
  const automationResult = await runAutomations({
    supabase,
    organizationId: channel.organization_id,
    agentId: channel.agent_id,
    contactId,
    conversationId,
    messageText: effectiveText,
    isFirstMessage: conv.created,
    senderExternalId: msg.senderExternalId,
    channelIdentifier: msg.channelIdentifier,
    evolutionApiUrl: process.env.EVOLUTION_API_URL!,
    evolutionApiKey: process.env.EVOLUTION_API_KEY!,
  })
  if (automationResult.skipAI) {
    console.log('[webhook] automation handled, skipping AI')
    return
  }

  console.log('[webhook] running AI for conversation:', conversationId)

  // 7. Fetch agent config
  const { data: agent } = await supabase
    .from('agents')
    .select('name, personality, ai_config, behavior_config')
    .eq('id', channel.agent_id)
    .single()

  if (!agent) return

  // 8. Fetch last 10 messages for conversation history
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(10)

  const conversationHistory = (history ?? [])
    .reverse()
    .filter((m) => m.content !== '[mídia]')
    .slice(0, -1) // exclude the message we just inserted
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 9a. Campaign context — inject if contact was reached via campaign
  let campaignContext = ''
  try {
    campaignContext = await retrieveCampaignContext(supabase, conversationId, contactId, channel.organization_id) ?? ''
  } catch {
    // optional — continue without it
  }

  // 9. RAG context (optional)
  let retrievedContext = ''
  let imageUrlsFromKnowledge: string[] = []
  try {
    if (openaiKey) {
      const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: effectiveText }),
      })
      if (embedRes.ok) {
        const { data } = await embedRes.json()
        const embedding: number[] = data[0].embedding
        const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
          query_embedding: `[${embedding.join(',')}]`,
          match_agent_id: channel.agent_id,
          match_threshold: 0.5,
          match_count: 8,
        })
        if (chunks?.length) {
          const typedChunks = chunks as { content: string; metadata?: { imageUrl?: string } }[]
          retrievedContext = typedChunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
          imageUrlsFromKnowledge = typedChunks
            .filter((c) => c.metadata?.imageUrl)
            .map((c) => c.metadata!.imageUrl!)
            .slice(0, 3)
        }
      }
    }
  } catch {
    // RAG is optional — continue without it
  }

  // 10. Run AI agent

  let aiResult
  try {
    aiResult = await runAgent({
      personality: agent.personality,
      aiConfig: agent.ai_config,
      behaviorConfig: agent.behavior_config,
      conversationHistory,
      userMessage: effectiveText,
      retrievedContext: retrievedContext || undefined,
      campaignContext: campaignContext || undefined,
      env: {
        openaiApiKey: aiKeys.openaiApiKey || process.env.OPENAI_API_KEY,
        anthropicApiKey: aiKeys.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        groqApiKey: aiKeys.groqApiKey || process.env.GROQ_API_KEY,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[webhook] AI error:', errMsg, '| provider:', (agent.ai_config as any)?.provider ?? 'openai', '| hasOpenAIKey:', !!(aiKeys.openaiApiKey || process.env.OPENAI_API_KEY))

    // Send fallback message so user isn't left waiting
    const fallbackText = (agent.personality as any)?.fallbackMessage
      || 'Olá! Estou com uma instabilidade momentânea. Em breve retorno sua mensagem.'
    try {
      const fallbackAdapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        msg.channelIdentifier
      )
      await fallbackAdapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: msg.channelIdentifier,
        recipientExternalId: msg.senderExternalId,
        contentType: 'text',
        text: fallbackText,
      })
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: fallbackText,
        content_type: 'text',
        sender_type: 'agent',
      })
      console.log('[webhook] fallback message sent due to AI error')
    } catch (sendErr) {
      console.error('[webhook] failed to send fallback message:', sendErr instanceof Error ? sendErr.message : sendErr)
    }
    return
  }

  console.log('[webhook] AI result:', aiResult?.content?.slice(0, 80))
  const behavior = (agent.behavior_config ?? {}) as Record<string, any>
  // [[IMAGEM:chave]] / [[VIDEO:chave]] → URL cadastrada em behavior_config.imagens / .videos;
  // chave desconhecida é ignorada.
  const pedidas = aiResult?.media ?? []
  const agentImages = [...pedidas, ...midiasPorTexto(aiResult?.content ?? '', behavior.midiaPorTexto, pedidas)]
    .map((m) =>({ ...m, url: (m.tipo === 'video' ? behavior.videos : behavior.imagens)?.[m.chave] as string | undefined }))
    .filter((i): i is { tipo: 'imagem' | 'video'; chave: string; url: string } => {
      if (!i.url) console.warn(`[webhook] ${i.tipo} "${i.chave}" pedida pelo agente não está cadastrada`)
      return !!i.url
    })
  if (!aiResult?.content && !agentImages.length) { console.warn('[webhook] AI returned no content'); return }

  // 11. Save AI response to DB
  if (aiResult.content) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: channel.organization_id,
      role: 'assistant',
      content: aiResult.content,
      content_type: 'text',
      sender_type: 'agent',
      ai_model: aiResult.model,
    })
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // 12. Send via WhatsApp
  const sendAdapter = new EvolutionWhatsAppAdapter(
    process.env.EVOLUTION_API_URL!,
    process.env.EVOLUTION_API_KEY!,
    msg.channelIdentifier
  )
  if (aiResult.content) {
    const enviado = await sendAdapter.sendMessage({
      channelType: 'whatsapp',
      channelIdentifier: msg.channelIdentifier,
      recipientExternalId: msg.senderExternalId,
      contentType: 'text',
      text: aiResult.content,
    })
    console.log('[webhook] message sent via WhatsApp')
    if (usaCentral) {
      await repassarSaida({ instancia: msg.channelIdentifier, telefone: msg.senderExternalId, texto: aiResult.content, externoId: enviado?.externalId })
    }
  }

  // 12a. Mídias pedidas pelo agente (folder, vídeos), depois do texto e na ordem pedida.
  for (const img of agentImages) {
    try {
      if (img.tipo === 'video') await sendAdapter.sendVideo(msg.senderExternalId, img.url)
      else await sendAdapter.sendImage(msg.senderExternalId, img.url)
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: `[${img.tipo}: ${img.chave}]`,
        content_type: img.tipo === 'video' ? 'video' : 'image',
        media_url: img.url,
        sender_type: 'agent',
      })
      console.log(`[webhook] imagem do agente enviada: ${img.chave}`)
    } catch (err) {
      console.warn(`[webhook] falha ao enviar imagem ${img.chave}:`, err instanceof Error ? err.message : err)
    }
  }

  // 12c. Resumo do lead ([[LEAD]]) para os telefones da equipe, pelo próprio número do canal.
  const telefonesResumo: string[] = Array.isArray(behavior.resumoLead?.telefones) ? behavior.resumoLead.telefones : []
  let leadSummary = aiResult.leadSummary
  if (!leadSummary && telefonesResumo.length && openaiKey && precisaResumo(aiResult.content, behavior.resumoLead?.gatilhos)) {
    // O modelo esqueceu o [[LEAD]] numa proposta/consulta: extrai da conversa.
    leadSummary = await extrairResumo({
      openaiKey,
      historico: [...conversationHistory, { role: 'user' as const, content: effectiveText ?? '' }],
      ultimaResposta: aiResult.content,
    })
      .catch(() => null)
    if (leadSummary) console.log('[webhook] resumo do lead extraído pelo sistema (agente não mandou [[LEAD]])')
  }
  if (leadSummary && telefonesResumo.length) {
    const texto = `📋 Resumo de contato (${agent.name ?? 'agente'})\n\n${leadSummary}\nWhatsApp do contato: +${msg.senderExternalId}`
    for (const tel of telefonesResumo) {
      try {
        await sendAdapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: msg.channelIdentifier,
          recipientExternalId: String(tel).replace(/\D/g, ''),
          contentType: 'text',
          text: texto,
        })
        console.log('[webhook] resumo do lead enviado para a equipe')
      } catch (err) {
        console.warn('[webhook] falha ao enviar resumo do lead:', err instanceof Error ? err.message : err)
      }
    }
  }

  // 12b. Send product images from knowledge base
  for (const imageUrl of imageUrlsFromKnowledge) {
    try {
      await sendAdapter.sendImage(msg.senderExternalId, imageUrl)
      console.log('[webhook] product image sent:', imageUrl.slice(0, 60))
    } catch (err) {
      console.warn('[webhook] failed to send product image:', err instanceof Error ? err.message : err)
    }
  }

  // 13. Deduct credits (text=1, audio=3, image=10)
  await supabase
    .from('organizations')
    .update({ credits_balance: org.credits_balance - creditCost })
    .eq('id', channel.organization_id)

  // 14. If agent detected handoff trigger, send handoff message + switch to human mode
  if (aiResult.shouldHandoffToHuman) {
    const handoffMsg = ((agent.behavior_config as any)?.offHoursMessage ?? '').trim()
    if (handoffMsg) {
      try {
        await sendAdapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: msg.channelIdentifier,
          recipientExternalId: msg.senderExternalId,
          contentType: 'text',
          text: handoffMsg,
        })
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          organization_id: channel.organization_id,
          role: 'assistant',
          content: handoffMsg,
          content_type: 'text',
          sender_type: 'human',
        })
        await supabase.from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
        console.log('[webhook] handoff message sent')
      } catch (err) {
        console.error('[webhook] failed to send handoff message:', err instanceof Error ? err.message : err)
      }
    }
    await supabase
      .from('conversations')
      .update({ mode: 'human' })
      .eq('id', conversationId)
    console.log('[webhook] conversation switched to human mode')
    // Central do rotograma: a conversa sobe como "aguardando torre"
    if (usaCentral) {
      await repassarSaida({
        instancia: msg.channelIdentifier, telefone: msg.senderExternalId, precisaTorre: true,
        texto: handoffMsg || 'O robô pediu ajuda da torre nesta conversa.',
        tipo: handoffMsg ? 'texto' : 'sistema',
      })
    }
  }
}

// ─── Meta Cloud API handler ───────────────────────────────────────────────────

async function handleMetaWebhook(payload: unknown) {
  const msg = metaParseAdapter.parseWebhook(payload)
  if (!msg) {
    console.log('[webhook/meta] no message parsed — likely a status update, skipping')
    return
  }

  console.log('[webhook/meta] msg parsed:', {
    phoneNumberId: msg.channelIdentifier,
    from: msg.senderExternalId,
    type: msg.contentType,
    text: msg.text?.slice(0, 50),
  })

  const supabase = getSupabase()

  // 1. Find channel by phoneNumberId in credentials
  const { data: channelRows } = await supabase
    .from('channels')
    .select('id, organization_id, agent_id, status, credentials')
    .eq('type', 'whatsapp')
    .filter('credentials->>phoneNumberId', 'eq', msg.channelIdentifier)
    .limit(1)

  const channel = channelRows?.[0]
  if (!channel) {
    console.warn(`[webhook/meta] no channel found for phoneNumberId: ${msg.channelIdentifier}`)
    return
  }

  const credentials = channel.credentials as { provider: string; phoneNumberId: string; accessToken: string }
  const sendAdapter = new MetaCloudWhatsAppAdapter(credentials.phoneNumberId, credentials.accessToken)

  // 2. Check credits
  const { data: org } = await supabase
    .from('organizations')
    .select('credits_balance, settings')
    .eq('id', channel.organization_id)
    .single()

  if (!org || org.credits_balance <= 0) {
    console.warn(`[webhook/meta] no credits for org: ${channel.organization_id}`)
    return
  }

  // 3. Upsert contact
  let contactId: string
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('organization_id', channel.organization_id)
    .eq('channel_type', 'whatsapp')
    .eq('external_id', msg.senderExternalId)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
    if (msg.senderName && !existingContact.name) {
      await supabase.from('contacts').update({ name: msg.senderName }).eq('id', contactId)
    }
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: channel.organization_id,
        external_id: msg.senderExternalId,
        channel_type: 'whatsapp',
        name: msg.senderName ?? msg.senderExternalId,
        phone: msg.senderExternalId,
      })
      .select('id')
      .single()
    if (!newContact) {
      console.error('[webhook/meta] contact insert failed:', contactErr?.message)
      return
    }
    contactId = newContact.id
  }

  // 4. Find or create open conversation
  const conv = await findOrCreateOpenConversation(supabase, {
    organizationId: channel.organization_id,
    contactId,
    channelId: channel.id,
    agentId: channel.agent_id,
    mode: 'ai',
  })
  if (!conv) {
    console.error('[webhook/meta] conversation resolve failed')
    return
  }
  const conversationId = conv.id
  const conversationMode = conv.mode

  // 5. Save incoming message
  const { data: savedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      organization_id: channel.organization_id,
      role: 'user',
      content: msg.text ?? '[mídia]',
      content_type: msg.contentType,
      media_url: msg.mediaUrl ?? null,
      sender_type: 'contact',
      external_id: msg.externalId,
    })
    .select('id, created_at')
    .single()

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (conversationMode === 'human') return
  if (!savedMsg) return
  if (msg.contentType === 'document') return

  // 6. Debounce (8s)
  await new Promise((r) => setTimeout(r, 8000))
  const { data: newerMsgs } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .gte('created_at', savedMsg.created_at)
    .neq('id', savedMsg.id)
    .limit(1)

  if (newerMsgs && newerMsgs.length > 0) return

  // Batch consecutive messages
  const { data: lastAssistant } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: pendingUserMsgs } = await supabase
    .from('messages')
    .select('content, content_type, created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .neq('content_type', 'document')
    .gt('created_at', lastAssistant?.created_at ?? '1970-01-01')
    .order('created_at', { ascending: true })

  const orgSettings = org.settings as Record<string, Record<string, string>> | null
  const aiKeys = orgSettings?.aiKeys ?? {}
  const openaiKey = aiKeys.openaiApiKey || process.env.OPENAI_API_KEY

  const validPending = (pendingUserMsgs ?? []).filter((m) => m.content && m.content !== '[mídia]')
  let effectiveText = validPending.length > 1
    ? validPending.map((m) => m.content).join('\n')
    : msg.text

  // Audio transcription via Meta media URL
  if (msg.contentType === 'audio' && msg.mediaUrl?.startsWith('meta-media://')) {
    const mediaId = msg.mediaUrl.replace('meta-media://', '')
    try {
      const urlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}?fields=url&access_token=${credentials.accessToken}`)
      const { url: audioUrl } = await urlRes.json()
      const audioRes = await fetch(audioUrl, { headers: { Authorization: `Bearer ${credentials.accessToken}` } })
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer())
      const fd = new FormData()
      fd.append('file', new Blob([audioBuffer], { type: msg.mimeType ?? 'audio/ogg' }), 'audio.ogg')
      fd.append('model', 'whisper-1')
      fd.append('language', 'pt')
      const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd,
      })
      if (tr.ok) {
        const { text: transcribed } = await tr.json()
        if (transcribed?.trim()) {
          effectiveText = transcribed.trim()
          await supabase.from('messages').update({ content: effectiveText }).eq('id', savedMsg.id)
        }
      }
    } catch (err) {
      console.warn('[webhook/meta] audio transcription failed:', err instanceof Error ? err.message : err)
    }
    if (!effectiveText) return
  }

  if (!effectiveText) return

  // 7. Fetch agent + conversation history
  const { data: agent } = await supabase
    .from('agents')
    .select('personality, ai_config, behavior_config')
    .eq('id', channel.agent_id)
    .single()
  if (!agent) return

  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(10)

  const conversationHistory = (history ?? [])
    .reverse()
    .filter((m) => m.content !== '[mídia]')
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 8. RAG context
  let retrievedContext = ''
  try {
    if (openaiKey) {
      const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: effectiveText }),
      })
      if (embedRes.ok) {
        const { data } = await embedRes.json()
        const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
          query_embedding: `[${data[0].embedding.join(',')}]`,
          match_agent_id: channel.agent_id,
          match_threshold: 0.5,
          match_count: 8,
        })
        if (chunks?.length) {
          retrievedContext = (chunks as { content: string }[]).map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
        }
      }
    }
  } catch { /* RAG is optional */ }

  // 9. Run AI
  let aiResult
  try {
    aiResult = await runAgent({
      personality: agent.personality,
      aiConfig: agent.ai_config,
      behaviorConfig: agent.behavior_config,
      conversationHistory,
      userMessage: effectiveText,
      retrievedContext: retrievedContext || undefined,
      env: {
        openaiApiKey: aiKeys.openaiApiKey || process.env.OPENAI_API_KEY,
        anthropicApiKey: aiKeys.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        groqApiKey: aiKeys.groqApiKey || process.env.GROQ_API_KEY,
      },
    })
  } catch (err) {
    console.error('[webhook/meta] AI error:', err instanceof Error ? err.message : err)
    const fallbackText = (agent.personality as any)?.fallbackMessage || 'Olá! Estou com uma instabilidade momentânea. Em breve retorno sua mensagem.'
    try {
      await sendAdapter.sendMessage({ channelType: 'whatsapp', channelIdentifier: msg.channelIdentifier, recipientExternalId: msg.senderExternalId, contentType: 'text', text: fallbackText })
    } catch { /* ignore */ }
    return
  }

  if (!aiResult?.content) return

  // 10. Save + send response
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    organization_id: channel.organization_id,
    role: 'assistant',
    content: aiResult.content,
    content_type: 'text',
    sender_type: 'agent',
    ai_model: aiResult.model,
  })

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

  await sendAdapter.sendMessage({
    channelType: 'whatsapp',
    channelIdentifier: msg.channelIdentifier,
    recipientExternalId: msg.senderExternalId,
    contentType: 'text',
    text: aiResult.content,
  })

  // 11. Deduct credits
  await supabase
    .from('organizations')
    .update({ credits_balance: org.credits_balance - 1 })
    .eq('id', channel.organization_id)

  // 12. Human handoff
  if (aiResult.shouldHandoffToHuman) {
    await supabase.from('conversations').update({ mode: 'human' }).eq('id', conversationId)
  }

  console.log('[webhook/meta] message processed and sent')
}

// ─── Connection state handler ─────────────────────────────────────────────────

async function handleConnectionUpdate(p: Record<string, unknown>) {
  const instanceName = p?.instance as string | undefined
  if (!instanceName) return

  // Evolution API sends state as p.data.instance.state or p.state
  const data = p?.data as Record<string, unknown> | undefined
  const state: string =
    (data?.instance as any)?.state ??
    (data as any)?.state ??
    (p?.state as string) ??
    ''

  console.log(`[webhook/connection] instance=${instanceName} state=${state}`)

  const supabase = getSupabase()

  // Find the channel by instanceName
  const { data: channels } = await supabase
    .from('channels')
    .select('id, organization_id, agent_id, status, config')
    .eq('type', 'whatsapp')
    .filter('credentials->>instanceName', 'eq', instanceName)
    .limit(1)

  const channel = channels?.[0]
  if (!channel) {
    console.warn(`[webhook/connection] no channel found for instance: ${instanceName}`)
    return
  }

  const config = (channel.config ?? {}) as Record<string, unknown>
  // O Evolution manda o número conectado (wuid) no "open"; guardamos para o alerta.
  const wuid = ((data as any)?.wuid ?? (data?.instance as any)?.wuid ?? '') as string
  const numeroOpen = wuid ? wuid.split('@')[0].split(':')[0] : ''
  const numeroCanal = numeroOpen || ((config.phone as string | null) ?? null)

  if (state === 'open') {
    // Connection established — mark as connected
    if (channel.status !== 'connected') {
      await supabase
        .from('channels')
        .update({
          status: 'connected',
          connected_at: new Date().toISOString(),
          ...(numeroOpen ? { config: { ...config, phone: numeroOpen } } : {}),
        })
        .eq('id', channel.id)
      console.log(`[webhook/connection] channel ${channel.id} → connected`)
      await avisarReconexao(supabase, channel, numeroCanal)
    } else if (numeroOpen && config.phone !== numeroOpen) {
      await supabase.from('channels').update({ config: { ...config, phone: numeroOpen } }).eq('id', channel.id)
    }
  } else if (['close', 'closing', 'qrcode', 'notLogged'].includes(state) || state === '') {
    // Connection lost — mark as disconnected and create alert
    if (channel.status !== 'disconnected') {
      await supabase
        .from('channels')
        .update({ status: 'disconnected' })
        .eq('id', channel.id)
      console.warn(`[webhook/connection] channel ${channel.id} → DISCONNECTED (state=${state})`)

      // Store disconnection alert in organization settings for UI banner
      const { data: org } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', channel.organization_id)
        .single()

      const settings = (org?.settings ?? {}) as Record<string, unknown>
      const alerts: any[] = Array.isArray(settings.channelAlerts) ? settings.channelAlerts : []

      // Keep only last 10 alerts and avoid duplicates for the same channel
      const filtered = alerts.filter((a: any) => a.channelId !== channel.id)
      filtered.unshift({
        channelId: channel.id,
        instanceName,
        type: 'disconnected',
        state,
        at: new Date().toISOString(),
      })

      await supabase
        .from('organizations')
        .update({ settings: { ...settings, channelAlerts: filtered.slice(0, 10) } })
        .eq('id', channel.organization_id)

      // Estado vazio é payload estranho, não queda confirmada: marca, mas não acorda ninguém.
      if (state) await avisarDesconexao(supabase, channel, numeroCanal)
    }
  }
}

// ─── Automations engine ────────────────────────────────────────────────────────

async function runAutomations(ctx: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
  agentId: string
  contactId: string
  conversationId: string
  messageText: string
  isFirstMessage: boolean
  senderExternalId: string
  channelIdentifier: string
  evolutionApiUrl: string
  evolutionApiKey: string
}): Promise<{ skipAI: boolean }> {
  try {
    const { data: automations } = await ctx.supabase
      .from('automations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .or(`agent_id.is.null,agent_id.eq.${ctx.agentId}`)

    if (!automations?.length) return { skipAI: false }

    // A Vercel roda em UTC; o expediente configurado é no horário de Brasília.
    const nowHour = parseInt(
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date()),
      10
    ) % 24
    let skipAI = false

    for (const automation of automations) {
      const tc = (automation.trigger_config ?? {}) as Record<string, unknown>
      const ac = (automation.action_config ?? {}) as Record<string, unknown>

      // Check trigger
      let triggered = false
      if (automation.trigger_type === 'keyword' && ctx.messageText) {
        const keywords = (tc.keywords as string[] | undefined) ?? []
        const matchAll = tc.matchAll as boolean | undefined
        const text = ctx.messageText.toLowerCase()
        if (matchAll) {
          triggered = keywords.every((k) => text.includes(k.toLowerCase()))
        } else {
          triggered = keywords.some((k) => text.includes(k.toLowerCase()))
        }
      } else if (automation.trigger_type === 'first_message') {
        triggered = ctx.isFirstMessage
      } else if (automation.trigger_type === 'off_hours') {
        const start = (tc.endHour as number) ?? 8   // business start
        const end = (tc.startHour as number) ?? 18  // business end
        triggered = nowHour < start || nowHour >= end
      }

      if (!triggered) continue

      console.log(`[webhook] automation triggered: ${automation.name} (${automation.trigger_type} → ${automation.action_type})`)

      // Cada automação roda isolada: uma falha não pode impedir as seguintes,
      // e toda execução vira linha em automation_runs (sucesso ou erro).
      const startedAt = new Date().toISOString()
      const steps: Record<string, unknown>[] = [{
        step: 'trigger',
        type: automation.trigger_type,
        ...(automation.trigger_type === 'keyword' ? { text: ctx.messageText.slice(0, 200) } : {}),
        ...(automation.trigger_type === 'off_hours' ? { hour: nowHour } : {}),
      }]
      let status: 'completed' | 'failed' = 'completed'
      let errorMessage: string | null = null

      try {
        const check = (res: { error: { message: string } | null }, what: string) => {
          if (res.error) throw new Error(`${what}: ${res.error.message}`)
        }

        if (automation.action_type === 'send_message') {
          if (!ac.message) throw new Error('Mensagem vazia na configuração da ação')
          const adapter = new EvolutionWhatsAppAdapter(ctx.evolutionApiUrl, ctx.evolutionApiKey, ctx.channelIdentifier)
          await adapter.sendMessage({
            channelType: 'whatsapp',
            channelIdentifier: ctx.channelIdentifier,
            recipientExternalId: ctx.senderExternalId,
            contentType: 'text',
            text: ac.message as string,
          })
          // Save automation message in DB
          check(await ctx.supabase.from('messages').insert({
            conversation_id: ctx.conversationId,
            organization_id: ctx.organizationId,
            role: 'assistant',
            content: ac.message as string,
            content_type: 'text',
            sender_type: 'agent',
          }), 'gravar mensagem')
          await ctx.supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', ctx.conversationId)
          steps.push({ step: 'action', type: 'send_message', result: 'enviada' })
          skipAI = true
        } else if (automation.action_type === 'add_tag') {
          if (!ac.tag) throw new Error('Tag vazia na configuração da ação')
          const tag = ac.tag as string
          const { data: contact } = await ctx.supabase
            .from('contacts')
            .select('tags')
            .eq('id', ctx.contactId)
            .single()
          const existing: string[] = contact?.tags ?? []
          if (!existing.includes(tag)) {
            check(await ctx.supabase.from('contacts').update({ tags: [...existing, tag] }).eq('id', ctx.contactId), 'adicionar tag')
            steps.push({ step: 'action', type: 'add_tag', tag, result: 'adicionada' })
          } else {
            steps.push({ step: 'action', type: 'add_tag', tag, result: 'já existia' })
          }
        } else if (automation.action_type === 'change_stage') {
          if (!ac.stage) throw new Error('Etapa vazia na configuração da ação')
          const { data: before } = await ctx.supabase.from('contacts').select('kanban_stage').eq('id', ctx.contactId).maybeSingle()
          check(await ctx.supabase.from('contacts').update({ kanban_stage: ac.stage }).eq('id', ctx.contactId), 'mover etapa')
          steps.push({ step: 'action', type: 'change_stage', from: before?.kanban_stage ?? null, to: ac.stage })
        } else if (automation.action_type === 'handoff') {
          check(await ctx.supabase.from('conversations').update({ mode: 'human' }).eq('id', ctx.conversationId), 'transferir para humano')
          steps.push({ step: 'action', type: 'handoff', result: 'modo humano' })
          skipAI = true
        } else {
          throw new Error(`A ação "${automation.action_type}" ainda não é executada pelo motor`)
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`[webhook] automation ${automation.id} failed:`, errorMessage)
      }

      // Histórico e contador: nunca podem derrubar o atendimento.
      try {
        const { error: runErr } = await ctx.supabase.from('automation_runs').insert({
          automation_id: automation.id,
          organization_id: ctx.organizationId,
          conversation_id: ctx.conversationId,
          status,
          steps_log: steps,
          error_message: errorMessage,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        })
        if (runErr) console.error('[webhook] automation_runs insert error:', runErr.message)
        await ctx.supabase
          .from('automations')
          .update({ executions_count: (automation.executions_count ?? 0) + 1, last_run_at: new Date().toISOString() })
          .eq('id', automation.id)
      } catch (err) {
        console.error('[webhook] automation log error:', err instanceof Error ? err.message : err)
      }
    }

    return { skipAI }
  } catch (err) {
    console.error('[webhook] automations error:', err instanceof Error ? err.message : err)
    return { skipAI: false }
  }
}

async function retrieveCampaignContext(supabase: any, conversationId: string, contactId: string, organizationId?: string): Promise<string | undefined> {
  let campaignId: string | undefined
  let alreadySaved = false

  // 1. Try to find campaign via message history (sender_type='campaign')
  const { data: campaignMsg } = await supabase
    .from('messages')
    .select('metadata')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'campaign')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (campaignMsg?.metadata?.campaign_id) {
    campaignId = campaignMsg.metadata.campaign_id
    alreadySaved = true
  }

  // 2. Fallback: check campaign_messages table
  let campaignSentAt: string | undefined
  if (!campaignId && contactId) {
    const { data: cm } = await supabase
      .from('campaign_messages')
      .select('campaign_id, sent_at')
      .eq('contact_id', contactId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cm?.campaign_id) {
      campaignId = cm.campaign_id
      campaignSentAt = cm.sent_at
    }
  }

  if (!campaignId) return undefined

  // Load campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name, target_type, target_value, message, organization_id')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return undefined

  // 3. Save the campaign message to conversation history if not already there
  if (!alreadySaved && conversationId) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: campaign.organization_id ?? organizationId,
      role: 'assistant',
      content: campaign.message,
      content_type: 'text',
      sender_type: 'campaign',
      delivery_status: 'sent',
      metadata: { campaign_id: campaignId, campaign_name: campaign.name },
      ...(campaignSentAt ? { created_at: campaignSentAt } : {}),
    })
  }

  let listName = campaign.target_value
  if (campaign.target_type === 'list' && campaign.target_value) {
    const orgId = campaign.organization_id ?? organizationId
    const { data: org } = await supabase
      .from('organizations').select('settings').eq('id', orgId).maybeSingle()
    const lists: any[] = org?.settings?.contactLists ?? []
    const found = lists.find((l: any) => l.id === campaign.target_value)
    if (found?.name) listName = found.name
  }

  const targetLabels: Record<string, string> = {
    all: 'todos os contatos',
    tag: `contatos com a tag "${campaign.target_value}"`,
    stage: `contatos no estágio "${campaign.target_value}"`,
    list: `lista "${listName}"`,
    with_conversation: 'contatos com conversas anteriores',
  }
  const targetDesc = targetLabels[campaign.target_type] ?? campaign.target_type

  let context = `## Contexto de Campanha\n`
  context += `Este contato foi abordado pela campanha **"${campaign.name}"**, direcionada para ${targetDesc}.\n`
  context += `Mensagem enviada na campanha: "${campaign.message}"\n`
  context += `\nIMPORTANTE: Você já enviou uma abordagem inicial para este contato via campanha. `
  context += `Não pergunte informações que você já tem (como segmento, profissão ou tipo de negócio) se a campanha já segmentou esse público. `
  context += `Continue a conversa de forma coerente com o contexto da campanha.`

  return context
}

// ─── Evolution API media helper ───────────────────────────────────────────────

async function fetchEvolutionMedia(
  messageId: string,
  senderPhone: string,
  instanceName: string,
  messageType: 'imageMessage' | 'audioMessage' | 'documentMessage',
  groupJid?: string
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    // Em grupo, a mídia está sob o remoteJid do GRUPO, com o participante (remetente).
    const key = groupJid
      ? { id: messageId, fromMe: false, remoteJid: groupJid, participant: `${senderPhone}@s.whatsapp.net` }
      : { id: messageId, fromMe: false, remoteJid: `${senderPhone}@s.whatsapp.net` }
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.EVOLUTION_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: { key, messageType } }),
      }
    )
    if (!res.ok) {
      console.warn(`[webhook] fetchEvolutionMedia ${messageType} failed: HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn('[webhook] fetchEvolutionMedia error:', err instanceof Error ? err.message : err)
    return null
  }
}
