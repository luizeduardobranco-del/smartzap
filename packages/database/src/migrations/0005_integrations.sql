-- Integrations table for Google Calendar, Gmail, etc.
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null, -- 'google_calendar', 'gmail', etc.
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  email text, -- connected account email
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, provider)
);

alter table integrations enable row level security;

create policy "integrations_org_select" on integrations
  for select using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

create policy "integrations_org_insert" on integrations
  for insert with check (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

create policy "integrations_org_update" on integrations
  for update using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

create policy "integrations_org_delete" on integrations
  for delete using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );
