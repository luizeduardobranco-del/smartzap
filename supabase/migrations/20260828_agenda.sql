-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO AGENDA — agendamento com lembrete e confirmação por WhatsApp
--
-- Motivação: substituir a dependência do Google Calendar (que nunca conectou —
-- a tabela `integrations` está vazia) por agenda própria. O Google volta depois
-- como espelho de via única, via service account, sem OAuth e sem verificação.
--
-- DESENHO AGNÓSTICO DE NICHO
-- O produto atende vários segmentos e não dá para saber de antemão se o cliente
-- é consultório, salão, oficina ou consultoria. Por isso o modelo é genérico:
--
--   RECURSO (agenda_resources)  — o que fica ocupado: uma pessoa, uma sala,
--                                 uma cadeira, um equipamento.
--   SERVIÇO (agenda_services)   — o que se marca, com duração.
--   COMPROMISSO                 — recurso + serviço + contato + intervalo.
--
-- O que muda por nicho é vocabulário e campos extras, não estrutura. Ambos são
-- configuração em agenda_settings, não schema:
--   • labels     → "Profissional"/"Sala"/"Consultor", "Consulta"/"Serviço"
--   • custom_fields → convênio (clínica), placa (oficina), processo (advocacia)
--
-- Organização com um recurso só é o caso degenerado: uma linha em
-- agenda_resources, e a interface esconde o seletor.
--
-- Fuso por organização. O Brasil não tem horário de verão desde 2019, então
-- timestamptz + fuso fixo resolve sem aritmética de DST.
--
-- LIMITE DESTE DESENHO (proposital): serve "compromisso com duração contra um
-- recurso". NÃO serve reserva de restaurante por número de pessoas, hotel com
-- diárias, nem evento com venda de ingresso — esses pedem outro modelo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Necessária para o EXCLUDE de sobreposição (igualdade de uuid num índice gist).
create extension if not exists btree_gist;

-- ── Configuração da agenda por organização ─────────────────────────────────
create table if not exists agenda_settings (
  organization_id           uuid primary key references organizations(id) on delete cascade,

  -- Preset de nicho aplicado na configuração inicial. Os presets vivem no código
  -- (fáceis de iterar), aqui fica só o registro de qual foi escolhido.
  preset                    text,   -- 'clinica' | 'salao' | 'oficina' | 'consultoria' | ...

  -- Vocabulário da interface. É o que faz a mesma tela servir clínica e oficina.
  label_resource_singular   text not null default 'Profissional',
  label_resource_plural     text not null default 'Profissionais',
  label_service_singular    text not null default 'Serviço',
  label_service_plural      text not null default 'Serviços',
  label_appointment_singular text not null default 'Agendamento',
  label_appointment_plural  text not null default 'Agendamentos',

  -- Campos extras do compromisso, definidos pelo cliente. Formato:
  -- [{ "key":"convenio", "label":"Convênio", "type":"text|select|number|date",
  --    "options":["Unimed","Bradesco"], "required":false }]
  -- Mesmo padrão de contacts.custom_fields, que já existe no sistema.
  custom_fields             jsonb not null default '[]'::jsonb,

  timezone                  text not null default 'America/Sao_Paulo',
  -- Quantas horas antes do compromisso o pedido de confirmação sai.
  confirmation_hours_before integer not null default 24,
  -- Se true, quem não responde entra como confirmado. Default false de propósito:
  -- confirmar no silêncio é o que gera cadeira vazia.
  auto_confirm_on_no_reply  boolean not null default false,
  -- Janela do dia em que é permitido disparar (evita mensagem às 3h da manhã).
  send_window_start         time not null default '08:00',
  send_window_end           time not null default '20:00',
  -- Texto do pedido de confirmação. Aceita {{contato}}, {{servico}}, {{recurso}},
  -- {{data}}, {{hora}}. Nulo = usa o padrão do sistema.
  confirmation_template     text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Recursos agendáveis (pessoa, sala, equipamento) ────────────────────────
create table if not exists agenda_resources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  -- Só informativo/ícone na interface; não muda a regra de agendamento.
  kind            text not null default 'pessoa'
                  check (kind in ('pessoa','sala','equipamento','outro')),
  color           text,                       -- cor do bloco no calendário
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_agenda_res_org on agenda_resources(organization_id);

-- ── Serviços / itens agendáveis ────────────────────────────────────────────
create table if not exists agenda_services (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  -- Intervalo depois do atendimento (limpeza, anotação). Entra no cálculo do fim.
  buffer_minutes   integer not null default 0 check (buffer_minutes >= 0),
  price_cents      integer,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_agenda_serv_org on agenda_services(organization_id);

-- Qual recurso atende qual serviço. Sem linha aqui = atende qualquer um.
create table if not exists agenda_resource_services (
  resource_id uuid not null references agenda_resources(id) on delete cascade,
  service_id  uuid not null references agenda_services(id) on delete cascade,
  primary key (resource_id, service_id)
);

-- ── Expediente recorrente ──────────────────────────────────────────────────
create table if not exists agenda_availability (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resource_id     uuid not null references agenda_resources(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time      time not null,
  end_time        time not null,
  check (end_time > start_time),
  created_at      timestamptz not null default now()
);
create index if not exists idx_agenda_avail_res on agenda_availability(resource_id, weekday);

-- ── Bloqueios pontuais (férias, feriado, almoço, manutenção) ───────────────
create table if not exists agenda_blocks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Nulo = bloqueia a organização inteira (feriado).
  resource_id     uuid references agenda_resources(id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  check (ends_at > starts_at),
  created_at      timestamptz not null default now()
);
create index if not exists idx_agenda_blocks_range on agenda_blocks(organization_id, starts_at, ends_at);

-- ── Compromissos ───────────────────────────────────────────────────────────
create table if not exists agenda_appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resource_id     uuid not null references agenda_resources(id) on delete restrict,
  service_id      uuid references agenda_services(id) on delete set null,
  contact_id      uuid not null references contacts(id) on delete cascade,

  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  check (ends_at > starts_at),

  -- scheduled → confirmed → completed | no_show | cancelled
  status          text not null default 'scheduled'
                  check (status in ('scheduled','confirmed','completed','no_show','cancelled')),

  -- Estado do pedido de confirmação, separado do status do compromisso:
  -- um compromisso pode estar 'scheduled' com confirmação 'sem_resposta'.
  confirmation    text not null default 'pendente'
                  check (confirmation in ('pendente','enviada','confirmada','recusada','sem_resposta')),
  confirmed_at    timestamptz,

  -- Valores dos campos extras definidos em agenda_settings.custom_fields.
  custom_data     jsonb not null default '{}'::jsonb,

  notes           text,
  -- De onde veio: tela da recepção, agente de IA, importação.
  source          text not null default 'painel'
                  check (source in ('painel','agente','importacao')),
  created_by      uuid references auth.users(id) on delete set null,
  -- Espelho no Google (fase posterior, via service account). Nulo = não espelhado.
  google_event_id text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_agenda_appt_org_range on agenda_appointments(organization_id, starts_at);
create index if not exists idx_agenda_appt_res_range on agenda_appointments(resource_id, starts_at);
create index if not exists idx_agenda_appt_contact on agenda_appointments(contact_id);

-- Dupla marcação é impossível NO BANCO, não só na tela.
-- Mesma lição das conversas duplicadas: checar antes de inserir não sobrevive a
-- duas requisições simultâneas — só a restrição do banco sobrevive.
alter table agenda_appointments drop constraint if exists agenda_appointments_no_overlap;
alter table agenda_appointments add constraint agenda_appointments_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('scheduled','confirmed'));

-- ── Fila de lembretes — é o que o cron consome ─────────────────────────────
-- Mesma forma de funnel_contacts.next_message_at: busca o que venceu, dispara,
-- atualiza o estado. O motor de /api/funnels/process é reaproveitável quase inteiro.
create table if not exists agenda_reminders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id  uuid not null references agenda_appointments(id) on delete cascade,

  kind            text not null default 'confirmacao'
                  check (kind in ('confirmacao','lembrete')),
  scheduled_for   timestamptz not null,

  status          text not null default 'pendente'
                  check (status in ('pendente','enviado','respondido','falhou','cancelado')),
  sent_at         timestamptz,
  -- Resposta crua do contato, para auditoria quando a interpretação errar.
  response_text   text,
  responded_at    timestamptz,
  error_message   text,
  attempts        integer not null default 0,

  created_at      timestamptz not null default now()
);

-- O índice que o cron usa a cada minuto.
create index if not exists idx_agenda_rem_due
  on agenda_reminders(scheduled_for)
  where status = 'pendente';
create index if not exists idx_agenda_rem_appt on agenda_reminders(appointment_id);

-- Um lembrete de cada tipo por compromisso — evita disparo duplicado se a
-- criação do agendamento for reprocessada.
create unique index if not exists idx_agenda_rem_unico
  on agenda_reminders(appointment_id, kind)
  where status in ('pendente','enviado');

-- ── RLS: mesmo padrão de `integrations` ────────────────────────────────────
alter table agenda_settings          enable row level security;
alter table agenda_resources         enable row level security;
alter table agenda_services          enable row level security;
alter table agenda_resource_services enable row level security;
alter table agenda_availability      enable row level security;
alter table agenda_blocks            enable row level security;
alter table agenda_appointments      enable row level security;
alter table agenda_reminders         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'agenda_settings','agenda_resources','agenda_services',
    'agenda_availability','agenda_blocks','agenda_appointments','agenda_reminders'
  ] loop
    execute format('drop policy if exists %1$s_org_all on %1$I', t);
    execute format($f$
      create policy %1$s_org_all on %1$I
        for all
        using (organization_id in (
          select organization_id from organization_members where user_id = auth.uid()
        ))
        with check (organization_id in (
          select organization_id from organization_members where user_id = auth.uid()
        ))
    $f$, t);
  end loop;
end $$;

-- A tabela de junção não tem organization_id; herda pelo recurso.
drop policy if exists agenda_resource_services_org_all on agenda_resource_services;
create policy agenda_resource_services_org_all on agenda_resource_services
  for all
  using (resource_id in (
    select r.id from agenda_resources r
    join organization_members m on m.organization_id = r.organization_id
    where m.user_id = auth.uid()
  ))
  with check (resource_id in (
    select r.id from agenda_resources r
    join organization_members m on m.organization_id = r.organization_id
    where m.user_id = auth.uid()
  ));
