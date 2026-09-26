-- ═══════════════════════════════════════════════════════════════════════════
-- CONTATO NÃO É LEAD
--
-- Regra combinada: um contato só vira lead quando houve contato de verdade —
-- ele nos escreve, ou nós escrevemos para ele. Contato salvo na agenda
-- (importado de uma lista, do Google Maps, ou digitado à mão) não deve ocupar
-- o CRM.
--
-- O que estava errado: `contacts.kanban_stage` tinha default 'new', e o
-- cadastro e a importação ainda gravavam 'new' explicitamente. Resultado: toda
-- lista importada aparecia no quadro como lead novo.
--
-- Efeito colateral que isso também causava, e que some junto: a importação usa
-- upsert com `ignoreDuplicates: false`. Reimportar uma lista que contivesse um
-- cliente já fechado reescrevia o `kanban_stage` dele de volta para 'new' —
-- um lead qualificado voltava para a primeira coluna sozinho.
--
-- Depois desta migration, NULO passa a significar "não está no funil", e quem
-- promove o contato a lead é a criação da conversa (lib/conversations.ts) ou o
-- disparo de campanha.
-- ═══════════════════════════════════════════════════════════════════════════

alter table contacts alter column kanban_stage drop default;

-- ───────────────────────────────────────────────────────────────────────────
-- LIMPEZA DO QUE JÁ ENTROU ERRADO
--
-- Tira do funil apenas quem está em 'new' E nunca teve conversa E nunca
-- recebeu disparo. Quem já foi movido de coluna por alguém (contacted,
-- qualified, proposal, won, lost) não é tocado: mover de coluna é decisão
-- humana e vale como contato.
-- ───────────────────────────────────────────────────────────────────────────
update contacts c
set kanban_stage = null
where c.kanban_stage = 'new'
  and not exists (
    select 1 from conversations cv where cv.contact_id = c.id
  )
  and not exists (
    select 1 from campaign_messages cm
    where cm.contact_id = c.id and cm.status = 'sent'
  );

-- Confira o resultado antes de fechar a aba:
--
--   select
--     count(*) filter (where kanban_stage is null) as fora_do_funil,
--     count(*) filter (where kanban_stage is not null) as no_funil
--   from contacts;
