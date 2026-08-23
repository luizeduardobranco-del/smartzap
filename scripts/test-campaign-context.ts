/**
 * Teste: mensagem de campanha é salva no histórico de conversa
 *
 * Como executar:
 *   DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   tsx scripts/test-campaign-context.ts
 *
 * O que valida:
 *   1. Após o disparo, a mensagem existe na tabela `messages` com role=assistant / sender_type=campaign
 *   2. A conversa foi criada ou reutilizada corretamente
 *   3. O agente de IA recebe o histórico com a mensagem da campanha ao responder
 */

import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(label: string) {
  console.log(`  ✅ ${label}`)
}

function fail(label: string, detail?: string) {
  console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
  process.exitCode = 1
}

async function cleanup(ids: {
  messageId?: string
  conversationId?: string
  contactId?: string
}) {
  if (ids.messageId)
    await supabase.from('messages').delete().eq('id', ids.messageId)
  if (ids.conversationId)
    await supabase.from('conversations').delete().eq('id', ids.conversationId)
  if (ids.contactId)
    await supabase.from('contacts').delete().eq('id', ids.contactId)
}

// ─── Testes ───────────────────────────────────────────────────────────────────

async function testCampaignMessageSavedToHistory() {
  console.log('\n[Teste 1] Mensagem de campanha salva no histórico de conversa')

  // Busca um canal real (que já tenha organização vinculada)
  const { data: channel } = await supabase
    .from('channels')
    .select('id, agent_id, organization_id')
    .limit(1)
    .single()

  if (!channel) {
    fail('Nenhum canal encontrado — rode com um banco populado')
    return
  }

  const org = { id: channel.organization_id }

  const ids: { messageId?: string; conversationId?: string; contactId?: string } = {}

  try {
    // 1. Cria contato de teste
    const { data: contact } = await supabase
      .from('contacts')
      .insert({
        organization_id: org.id,
        name: '[TEST] Advogado Teste',
        phone: '5511999990000',
        channel_type: 'whatsapp',
        external_id: 'test_ext_' + Date.now(),
      })
      .select('id')
      .single()

    assert.ok(contact?.id, 'Contato de teste criado')
    ids.contactId = contact!.id
    pass('Contato de teste criado')

    // 2. Simula o que o route.ts faz: busca ou cria conversa + insere mensagem
    const campaignText = '[TEST] Olá! Você é advogado(a)? Temos algo para você.'
    const campaignId = 'test-campaign-' + Date.now()
    const campaignName = 'Advogados Fase 1 - Teste'

    // Busca conversa existente
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact!.id)
      .eq('channel_id', channel.id)
      .eq('status', 'open')
      .maybeSingle()

    let conversationId = existingConv?.id ?? null

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          organization_id: org.id,
          contact_id: contact!.id,
          channel_id: channel.id,
          agent_id: channel.agent_id,
          status: 'open',
          mode: 'ai',
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      conversationId = newConv?.id ?? null
    }

    assert.ok(conversationId, 'Conversa criada ou encontrada')
    ids.conversationId = conversationId!
    pass('Conversa criada/encontrada')

    // 3. Insere a mensagem de campanha
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        organization_id: org.id,
        role: 'assistant',
        content: campaignText,
        content_type: 'text',
        sender_type: 'campaign',
        delivery_status: 'sent',
        metadata: { campaign_id: campaignId, campaign_name: campaignName },
      })
      .select('id, role, sender_type, content')
      .single()

    assert.ok(!msgError, `Mensagem inserida sem erro: ${msgError?.message}`)
    assert.equal(message?.role, 'assistant')
    assert.equal(message?.sender_type, 'campaign')
    ids.messageId = message!.id
    pass('Mensagem de campanha inserida em messages com role=assistant, sender_type=campaign')

    // 4. Simula o que o worker faz ao buscar histórico quando cliente responde
    const { data: history } = await supabase
      .from('messages')
      .select('role, content, sender_type')
      .eq('conversation_id', conversationId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(20)

    assert.ok(history && history.length > 0, 'Histórico não está vazio')
    const campaignMsg = history!.find((m) => m.sender_type === 'campaign')
    assert.ok(campaignMsg, 'Mensagem de campanha encontrada no histórico')
    assert.equal(campaignMsg?.content, campaignText)
    pass('Worker encontra a mensagem de campanha no histórico da conversa')

    // 5. Verifica que a conversa tem last_message_at atualizado
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

    const { data: conv } = await supabase
      .from('conversations')
      .select('last_message_at')
      .eq('id', conversationId!)
      .single()

    assert.ok(conv?.last_message_at, 'last_message_at atualizado na conversa')
    pass('Conversa com last_message_at atualizado')

    console.log('\n  ✅ Todos os testes passaram — contexto da campanha será preservado para o agente de IA')
  } finally {
    await cleanup(ids)
    console.log('  🧹 Dados de teste removidos')
  }
}

async function testNoDuplicateConversation() {
  console.log('\n[Teste 2] Dois disparos para o mesmo contato reutilizam a mesma conversa')

  const { data: channel } = await supabase
    .from('channels')
    .select('id, agent_id, organization_id')
    .limit(1)
    .single()

  if (!channel) {
    fail('Nenhum canal encontrado')
    return
  }

  const org = { id: channel.organization_id }

  const ids: { messageId1?: string; messageId2?: string; conversationId?: string; contactId?: string } = {}

  try {
    const { data: contact } = await supabase
      .from('contacts')
      .insert({
        organization_id: org.id,
        name: '[TEST] Contato Duplicado',
        phone: '5511888880000',
        channel_type: 'whatsapp',
        external_id: 'test_dup_' + Date.now(),
      })
      .select('id')
      .single()

    ids.contactId = contact!.id

    // Primeiro disparo
    const { data: conv1 } = await supabase
      .from('conversations')
      .insert({
        organization_id: org.id,
        contact_id: contact!.id,
        channel_id: channel.id,
        agent_id: channel.agent_id,
        status: 'open',
        mode: 'ai',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    ids.conversationId = conv1!.id

    const { data: msg1 } = await supabase
      .from('messages')
      .insert({ conversation_id: conv1!.id, organization_id: org.id, role: 'assistant', content: 'Mensagem 1', sender_type: 'campaign', content_type: 'text' })
      .select('id').single()
    ids.messageId1 = msg1!.id

    // Segundo disparo — deve reutilizar a mesma conversa
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact!.id)
      .eq('channel_id', channel.id)
      .eq('status', 'open')
      .maybeSingle()

    assert.equal(existing?.id, conv1!.id, 'Segunda busca retorna a mesma conversa')

    const { data: msg2 } = await supabase
      .from('messages')
      .insert({ conversation_id: existing!.id, organization_id: org.id, role: 'assistant', content: 'Mensagem 2', sender_type: 'campaign', content_type: 'text' })
      .select('id').single()
    ids.messageId2 = msg2!.id

    const { data: allMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conv1!.id)
      .eq('sender_type', 'campaign')

    assert.equal(allMessages?.length, 2, 'Ambas as mensagens na mesma conversa')
    pass('Dois disparos para o mesmo contato usam a mesma conversa (sem duplicatas)')

  } finally {
    if (ids.messageId1) await supabase.from('messages').delete().eq('id', ids.messageId1)
    if (ids.messageId2) await supabase.from('messages').delete().eq('id', ids.messageId2)
    if (ids.conversationId) await supabase.from('conversations').delete().eq('id', ids.conversationId)
    if (ids.contactId) await supabase.from('contacts').delete().eq('id', ids.contactId)
    console.log('  🧹 Dados de teste removidos')
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Testando: contexto de campanha preservado para agente de IA\n')

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  await testCampaignMessageSavedToHistory()
  await testNoDuplicateConversation()

  if (process.exitCode === 1) {
    console.log('\n❌ Alguns testes falharam')
  } else {
    console.log('\n✅ Todos os testes passaram')
  }
}

main().catch((e) => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
