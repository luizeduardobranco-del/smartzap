-- ═══════════════════════════════════════════════════════════════════════════
-- CHAVES DE API POR ORGANIZAÇÃO
--
-- Motivação: as integrações existentes (garagem-alert, tracker-alert) usam uma
-- chave única no ambiente do servidor. Isso funciona para um cliente nosso, mas
-- não é SaaS: cada loja do WHITE ERP — e amanhã cada sistema de terceiro —
-- precisa da PRÓPRIA chave, que ela mesma gera e revoga, sem passar por nós.
--
-- A chave também carrega a identidade: quem autentica com ela JÁ É a
-- organização dona. Some o `organizationSlug` no corpo do POST, e com ele o
-- risco de um cliente mandar mensagem pelo canal de outro.
--
-- SEGURANÇA
--   • O texto puro da chave nunca é gravado: só o SHA-256.
--   • `key_prefix` (12 primeiros caracteres) existe só para a pessoa reconhecer
--     a chave na lista — não serve para autenticar.
--   • Revogar é marcar `revoked_at`; nunca apagar, para o log continuar
--     explicando quem chamou o quê.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Nome dado pelo cliente: "Minha loja no White ERP", "ERP da filial 2".
  name            text not null,

  -- wz_live_xxxxxxxxxxxx — só para exibir.
  key_prefix      text not null,
  -- SHA-256 do texto puro, em hexadecimal.
  key_hash        text not null unique,

  -- O que a chave pode fazer. Hoje só 'pedido-alert'; a coluna evita uma
  -- migration quando entrar a próxima integração.
  scopes          text[] not null default array['pedido-alert'],

  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists api_keys_org_idx on api_keys(organization_id);
-- A autenticação busca por hash: tem que ser um índice, não uma varredura.
create index if not exists api_keys_hash_idx on api_keys(key_hash) where revoked_at is null;

alter table api_keys enable row level security;

-- Quem enxerga a chave é quem é membro da organização. O endpoint de
-- autenticação usa service_role e não passa por aqui.
drop policy if exists api_keys_org_all on api_keys;
create policy api_keys_org_all on api_keys
  for all
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );
