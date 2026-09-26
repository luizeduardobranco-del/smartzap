-- ═══════════════════════════════════════════════════════════════════════════
-- MODO SUPORTE (entrar como usuário)
--
-- Motivação: para resolver o problema de um cliente, o suporte precisava pedir
-- a senha dele. Isso é o pior dos dois mundos — a senha circula por WhatsApp,
-- e depois ninguém sabe quem entrou, quando, nem para quê.
--
-- Aqui o admin da plataforma abre uma sessão do usuário SEM senha, e cada
-- entrada fica registrada nesta tabela. É a tabela que transforma o recurso em
-- suporte auditável: sem ela, seria só uma porta dos fundos.
--
-- COMO A VOLTA FUNCIONA SEM SENHA
--   Ao entrar, geramos um `return_token` aleatório, guardado só aqui e enviado
--   ao navegador num cookie httpOnly. Ao sair, o servidor troca esse token pelo
--   admin_user_id desta linha e reabre a sessão do admin. O token é de uso
--   único: sair apaga (`return_token = null`) e carimba `ended_at`.
--
--   Por que não confiar no e-mail do admin gravado no cookie: cookie é dado do
--   cliente. Quem forjasse "admin@..." reabriria a sessão de um admin. O token
--   aleatório precisa existir nesta tabela e estar em aberto para valer.
--
-- LGPD
--   O suporte enxerga dados de terceiros (no caso da Trans School, famílias e
--   crianças). O `motivo` é obrigatório justamente para que cada acesso tenha
--   uma justificativa registrada, e não deve ser preenchido com "teste".
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists impersonation_logs (
  id              uuid primary key default gen_random_uuid(),

  -- Quem entrou.
  admin_user_id   uuid not null references auth.users(id) on delete cascade,
  admin_email     text not null,

  -- Em quem entrou. O e-mail fica desnormalizado de propósito: se o usuário
  -- for excluído depois, o log precisa continuar dizendo quem era.
  target_user_id  uuid not null,
  target_email    text not null,
  target_org_id   uuid references organizations(id) on delete set null,

  motivo          text not null check (length(trim(motivo)) >= 5),

  -- Segredo de uso único que devolve a sessão do admin. Nulo = sessão encerrada.
  return_token    text unique,

  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index if not exists impersonation_logs_admin_idx
  on impersonation_logs(admin_user_id, started_at desc);

create index if not exists impersonation_logs_target_idx
  on impersonation_logs(target_user_id, started_at desc);

-- Só existe para a troca na saída; some do índice assim que a sessão encerra.
create index if not exists impersonation_logs_return_idx
  on impersonation_logs(return_token) where return_token is not null;

alter table impersonation_logs enable row level security;

-- Ninguém lê pelo cliente, exceto admin da plataforma. As rotas de suporte
-- escrevem com service_role e NÃO passam por RLS — por isso esta policy é
-- conforto, não condição.
--
-- O bloco condicional existe porque a primeira versão desta migration
-- referenciava `public.platform_admins` direto: onde essa tabela mora em outro
-- schema, o Postgres aborta o lote inteiro e a tabela acima nem chega a ser
-- criada. Conforto nenhum vale derrubar a migration.
do $$
declare
  tabela_admins regclass := coalesce(
    to_regclass('public.platform_admins'),
    to_regclass('platform_admins')
  );
begin
  if tabela_admins is null then
    raise notice 'platform_admins não encontrada: a tabela de log foi criada sem a policy de leitura.';
    return;
  end if;

  execute 'drop policy if exists impersonation_logs_admin_read on impersonation_logs';
  execute format(
    'create policy impersonation_logs_admin_read on impersonation_logs for select
       using (exists (select 1 from %s where user_id = auth.uid()))',
    tabela_admins
  );
end $$;

-- O PostgREST guarda um cache do schema: sem este aviso, a API continua
-- respondendo PGRST205 ("não encontrei a tabela") mesmo com ela já criada.
notify pgrst, 'reload schema';
