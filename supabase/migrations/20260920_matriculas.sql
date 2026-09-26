-- ═══════════════════════════════════════════════════════════════════════════
-- FICHA DE MATRÍCULA
--
-- Motivação: o agente de WhatsApp qualifica o lead e o entrega ao atendente,
-- mas os dados da matrícula ficavam presos na conversa — alguém tinha que ler
-- o histórico e transcrever à mão. Esta tabela é o destino do formulário
-- público que o agente envia no fechamento: o responsável preenche uma vez, e
-- o atendimento recebe a ficha pronta, exportável em CSV.
--
-- Por que os dados NÃO são coletados no chat: CPF, documento e endereço
-- completo em conversa de WhatsApp ficam para sempre no histórico do canal,
-- visíveis a quem tiver acesso à caixa. O formulário grava direto no banco,
-- sob RLS da organização.
--
-- MULTI-TENANT
--   • A ficha é sempre de UMA organização; o link público carrega o slug dela.
--   • O formulário insere via service_role (rota de servidor), NUNCA com a
--     chave anônima — assim nenhum visitante enxerga fichas de ninguém.
--   • Quem lê é membro da organização, pela policy abaixo.
--
-- ATIVAÇÃO
--   O módulo é opcional: só aparece no menu de quem tem 'matriculas' em
--   organizations.settings->enabled_modules (mesmo mecanismo do 'affiliates').
--   As escolas do select saem de settings->matriculas->colegios.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists matriculas (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,

  -- Os cinco campos que o atendimento precisa para abrir a rota.
  responsavel_nome     text not null,
  responsavel_telefone text not null,
  aluno_nome           text not null,
  periodo              text not null check (periodo in ('manha', 'tarde')),
  endereco             text not null,
  colegio              text not null,

  -- Campos que o formulário pode ou não mostrar, conforme a organização.
  bairro               text,
  serie                text,
  observacao           text,

  -- 'formulario' = preenchida pelo responsável; 'atendente' = digitada
  -- internamente. Serve para medir quanto o agente está de fato entregando.
  origem               text not null default 'formulario',

  status               text not null default 'nova'
                       check (status in ('nova', 'em_contato', 'fechada', 'perdida')),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

-- A listagem é sempre "as fichas da minha organização, mais novas primeiro".
create index if not exists matriculas_org_criada_idx
  on matriculas(organization_id, created_at desc);

-- Telefone repetido não é erro (irmãos entram como duas fichas), mas o
-- atendimento precisa achar rápido as fichas do mesmo responsável.
create index if not exists matriculas_telefone_idx
  on matriculas(organization_id, responsavel_telefone);

alter table matriculas enable row level security;

-- Membro da organização enxerga e edita as fichas dela. O formulário público
-- não passa por aqui: entra por service_role, na rota /api/ficha/[slug].
drop policy if exists matriculas_org_all on matriculas;
create policy matriculas_org_all on matriculas
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

-- ───────────────────────────────────────────────────────────────────────────
-- ATIVAR PARA A TRANS SCHOOL
--
-- Liga o módulo e cadastra as duas escolas atendidas. Rode junto com a
-- migration; é idempotente e não mexe nas outras chaves de settings.
-- ───────────────────────────────────────────────────────────────────────────
update organizations
set settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
       'enabled_modules',
       (
         select coalesce(jsonb_agg(distinct m), '[]'::jsonb)
         from jsonb_array_elements_text(
           coalesce(settings->'enabled_modules', '[]'::jsonb) || '["matriculas"]'::jsonb
         ) as m
       ),
       'matriculas',
       jsonb_build_object(
         'titulo', 'Ficha de matrícula 2026',
         'subtitulo', 'Preencha os dados do aluno que o nosso atendimento confirma a vaga e a rota com você.',
         'colegios', jsonb_build_array(
           'Alfa Cem Global Academy — Unidade Tijuca',
           'pH Tijuca I'
         ),
         'pede_bairro', true,
         'pede_serie', true
       )
     )
where slug = 'transschool-1971bc51';
