-- Impede mais de uma conversa ABERTA por (contact_id, channel_id).
--
-- Origem do problema: em 03/08/2026 o garagem-alert disparou 5 alertas em ~2s
-- para o mesmo contato. Cada request checou "existe conversa aberta?" antes de o
-- outro inserir, e nasceram 5 conversas abertas. A partir daí o select dos
-- webhooks (`.eq('status','open').maybeSingle()`) passou a receber PGRST116/406
-- por casar múltiplas linhas, o erro era descartado, e TODA mensagem seguinte
-- criava mais uma conversa. Chegou a 533 conversas duplicadas / 741 mensagens
-- espalhadas, com a IA perdendo o histórico (lido por conversation_id).
--
-- O código agora usa findOrCreateOpenConversation() (apps/web/lib/conversations.ts),
-- que ordena + limit(1) e trata 23505 reconsultando. Este índice é a garantia de
-- que nem uma corrida nem um call site novo consigam recriar a duplicação.
--
-- Pré-requisito: rodar scripts/consolidate-duplicate-conversations.mjs --apply
-- (executado em 22/08/2026: 779 → 246 conversas abertas).

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_open_per_contact_channel
  ON conversations (contact_id, channel_id)
  WHERE status = 'open';
