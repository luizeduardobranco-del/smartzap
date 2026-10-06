-- ═══════════════════════════════════════════════════════════════════════════
-- CÓDIGOS DE CONEXÃO (WHITE FLEET → WHITE ZAP)
--
-- O cliente do WHITE FLEET liga a conta dele do WHITE ZAP sem copiar chave
-- longa: o WHITE ZAP mostra um código curto (WZ-7F3K-92QD), de uso ÚNICO e
-- válido por 24 h. O WHITE FLEET troca o código por uma chave de API da
-- organização (api_keys), e daí em diante as mensagens saem pelo WhatsApp
-- dessa conta.
--
-- Por que código e não e-mail (decisão de 06/10/2026): sabendo só o e-mail de
-- alguém, daria para ligar a conta de outro e mandar mensagem pelo número dele.
-- O código só existe para quem está logado na conta.
--
-- SEGURANÇA: como em api_keys, só o SHA-256 do código é gravado.
--
-- Rodar no SQL Editor do projeto do WHITE ZAP (qugdiemiyjycgsvstgaz).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists connection_codes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code_hash       text not null unique,
  -- Para qual sistema o código foi gerado. Hoje só 'white-fleet'.
  sistema         text not null default 'white-fleet',
  expires_at      timestamptz not null default now() + interval '24 hours',
  used_at         timestamptz,
  -- Quem usou, do lado de lá: "WF-1A2B3C4D · AGM3 LOCACAO".
  used_by         text,
  api_key_id      uuid references api_keys(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists connection_codes_org_idx on connection_codes(organization_id, created_at desc);

alter table connection_codes enable row level security;

drop policy if exists connection_codes_org_select on connection_codes;
create policy connection_codes_org_select on connection_codes
  for select
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

drop policy if exists connection_codes_org_insert on connection_codes;
create policy connection_codes_org_insert on connection_codes
  for insert
  with check (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );
