/**
 * WHITE CHAT → Rotograma — PEDIDO DE RETORNO NO GRUPO DO CLIENTE.
 *
 * O grupo dos clientes (ICONIC × Ativa) era só destino de aviso: o robô postava
 * entradas/saídas ali e ignorava tudo o que o cliente escrevia. Quando a ICONIC
 * pedia "mandar 6 carros 220" no grupo, ninguém do sistema ficava sabendo — o
 * pedido só virava solicitação se um humano abrisse o painel e marcasse veículo
 * por veículo. Este módulo fecha esse buraco.
 *
 * Fluxo: texto/áudio no grupo → interpretação (GPT-4o) → o rotograma PROPÕE as
 * placas → alguém responde CONFIRMA no grupo → as solicitações são criadas e as
 * transportadoras avisadas. A confirmação é obrigatória de propósito: uma frase
 * solta não pode esvaziar o pátio.
 *
 * Escopo: env GARAGEM_CLIENTE_GROUP_JIDS (lista de JIDs …@g.us). Sem a env, o
 * módulo fica inerte — nenhum grupo é tratado como grupo de cliente.
 */

import { PRODUTOS_CATALOGO } from './garagem-grupo'

/** É o grupo do CLIENTE (de onde os pedidos de retorno são LIDOS)? */
export function grupoClienteNoEscopo(groupJid: string | undefined): boolean {
  const jids = (process.env.GARAGEM_CLIENTE_GROUP_JIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!jids.length) return false // sem lista explícita não assume nada
  return !!groupJid && jids.includes(groupJid)
}

/**
 * Onde o robô PUBLICA a proposta e a confirmação.
 * NUNCA é o grupo do cliente: lá só entram as notificações de saída e os
 * relatórios, como sempre foi. A proposta é assunto interno da Ativa, então vai
 * para o grupo do pátio (GARAGEM_GROUP_JIDS) — ou para GARAGEM_PEDIDO_REPLY_JIDS
 * se quiser outro destino.
 */
export function destinoPropostaJid(): string | null {
  const lista = (process.env.GARAGEM_PEDIDO_REPLY_JIDS ?? process.env.GARAGEM_GROUP_JIDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  return lista[0] ?? null
}

/** CONFIRMA / CANCELA digitado no grupo interno — reconhecido sem custo de IA. */
export function respostaConfirmacao(texto: string | null): 'confirmar' | 'cancelar' | null {
  const t = (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim()
  if (!t) return null
  if (/^(confirma|confirmado|confirmar|pode mandar|pode solicitar|ok pode mandar|isso mesmo)$/.test(t)) return 'confirmar'
  if (/^(cancela|cancelar|cancelado|esquece|deixa pra la)$/.test(t)) return 'cancelar'
  return null
}

function rotogramaConfig() {
  return {
    baseUrl: (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    apiKey: (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim(),
  }
}

export interface PedidoIntencao {
  acao: 'solicitar' | 'confirmar' | 'cancelar' | 'nenhum'
  quantidade: number | null
  produto: string | null
  placas: string[]
}

const PEDIDO_PROMPT = `Você lê mensagens de um grupo de WhatsApp entre um estacionamento de caminhões (Estacionamento WR / Ativa Rio) e o cliente dono da carga (ICONIC).
O cliente usa o grupo para PEDIR que caminhões guardados no pátio sejam enviados para a fábrica dele.

Classifique a mensagem e responda APENAS JSON:
{
  "acao": "solicitar" | "confirmar" | "cancelar" | "nenhum",
  "quantidade": number|null,   // quantos caminhões foram pedidos
  "produto": string|null,      // produto pedido, padronizado em um destes: ${PRODUTOS_CATALOGO.join(' | ')}
  "placas": string[]           // placas citadas explicitamente ([] se nenhuma)
}

Regras:
- "solicitar": o cliente está PEDINDO carros. Ex.: "mandar 6 carros 220", "manda 3 de neutro leve", "podem enviar o RJG7F39", "preciso de 2 carros de 3080".
- "confirmar": alguém está confirmando uma proposta que o robô fez. Ex.: "confirma", "confirmado", "pode mandar", "isso mesmo", "ok pode solicitar".
- "cancelar": desistência da proposta. Ex.: "cancela", "deixa pra lá", "esquece".
- "nenhum": QUALQUER outra coisa — bom dia, dúvida, pergunta com "?", cobrança, comentário, aviso de chegada. Na dúvida, responda "nenhum".
- Número ou apelido de produto vira o nome do catálogo: "3080" → "NEXBASE 3080"; "neutro leve" → "NEUTRO LEVE"; "NH140" → "OLEO BASICO NH140".
- NUNCA devolva "produto": null quando o cliente escreveu algum produto. Se o que ele escreveu não estiver no catálogo, devolva o texto do produto EXATAMENTE como ele escreveu (ex.: "XPTO 55" → "XPTO 55"). Quem confere o estoque é o sistema do pátio, não você — inventar ou omitir o produto faz sair o caminhão errado.
- "produto": null SÓ quando o cliente realmente não disse produto nenhum (ex.: "manda 3 carros").
- Não escolha um produto "parecido" para encaixar no catálogo. "220" pode ser CHEVRON 220R ou PRIMA 220: nesse caso devolva "220" e deixe o pátio perguntar.
- Se o pedido tiver VÁRIOS produtos ("7 de 220R e 4 de 3043"), devolva "produto": null e "quantidade": null — o pátio vai pedir para separar em um pedido por produto.
- "quantidade" só quando o cliente disser quantos. Não invente.
- Pergunta ("tem carro de 220?") NÃO é solicitar — é "nenhum".`

/** Interpreta a frase do grupo. Retorna null quando não deve agir. */
export async function interpretarPedido(openaiKey: string, texto: string): Promise<PedidoIntencao | null> {
  const t = (texto ?? '').trim()
  if (!t) return null
  // Atalho barato e determinístico para as respostas de confirmação/cancelamento.
  const curto = t.toLowerCase().replace(/[^a-zà-ú\s]/gi, '').trim()
  if (/^(confirma|confirmado|confirmar|pode mandar|pode solicitar|isso mesmo|ok pode)$/.test(curto)) {
    return { acao: 'confirmar', quantidade: null, produto: null, placas: [] }
  }
  if (/^(cancela|cancelar|cancelado|esquece|deixa pra la)$/.test(curto)) {
    return { acao: 'cancelar', quantidade: null, produto: null, placas: [] }
  }
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: PEDIDO_PROMPT },
          { role: 'user', content: t },
        ],
      }),
    })
    if (!r.ok) return null
    const data = await r.json()
    const out = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
    const acao = ['solicitar', 'confirmar', 'cancelar'].includes(out.acao) ? out.acao : 'nenhum'
    if (acao === 'nenhum') return null
    return {
      acao,
      quantidade: Number.isFinite(Number(out.quantidade)) && Number(out.quantidade) > 0 ? Number(out.quantidade) : null,
      produto: typeof out.produto === 'string' && out.produto.trim() ? out.produto.trim() : null,
      placas: Array.isArray(out.placas) ? out.placas.filter((p: unknown) => typeof p === 'string') : [],
    }
  } catch (e) {
    console.error('[garagem-pedido] interpretar:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Repassa o pedido ao rotograma (fonte da verdade do pátio) e devolve a resposta p/ o grupo. */
export async function enviarPedidoGrupo(args: {
  intencao: PedidoIntencao
  grupoJid: string | undefined
  remetente: string | null
  remetenteNome: string | null
  texto: string | null
}): Promise<{ reply: string | null } | null> {
  const { baseUrl, apiKey } = rotogramaConfig()
  if (!baseUrl || !apiKey) {
    console.warn('[garagem-pedido] ROTOGRAMA_BASE_URL / GARAGEM_INTEGRATION_API_KEY ausentes')
    return null
  }
  try {
    const r = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        action: 'pedido-grupo',
        acao: args.intencao.acao,
        quantidade: args.intencao.quantidade,
        produto: args.intencao.produto,
        placas: args.intencao.placas,
        grupoJid: args.grupoJid ?? null,
        remetente: args.remetente,
        remetenteNome: args.remetenteNome,
        texto: args.texto,
      }),
    })
    if (!r.ok) {
      console.error('[garagem-pedido] rotograma respondeu', r.status)
      return null
    }
    const out = await r.json()
    return { reply: out?.reply ?? null }
  } catch (e) {
    console.error('[garagem-pedido] envio:', e instanceof Error ? e.message : e)
    return null
  }
}
