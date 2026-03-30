-- Platform admins table (SaaS operator accounts)
create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- No RLS needed — only accessible via service role key
alter table platform_admins enable row level security;

-- Only service role can read/write
create policy "platform_admins_service_only" on platform_admins
  for all using (false);
