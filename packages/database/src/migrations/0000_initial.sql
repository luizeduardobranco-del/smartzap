-- ZapAgent Initial Migration
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  credits_monthly INTEGER NOT NULL,
  limits JSONB NOT NULL DEFAULT '{}',
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial plans
INSERT INTO plans (name, slug, price_monthly, price_yearly, credits_monthly, limits) VALUES
  ('Free', 'free', 0, 0, 100, '{"maxAgents":1,"maxChannels":1,"maxTeamMembers":1,"maxDocumentsPerAgent":3,"hasCustomBranding":false,"hasApiAccess":false,"hasAutomations":false,"hasAnalytics":false}'),
  ('Starter', 'starter', 9700, 87000, 2000, '{"maxAgents":3,"maxChannels":3,"maxTeamMembers":2,"maxDocumentsPerAgent":20,"hasCustomBranding":false,"hasApiAccess":false,"hasAutomations":true,"hasAnalytics":true}'),
  ('Pro', 'pro', 29700, 267000, 10000, '{"maxAgents":10,"maxChannels":10,"maxTeamMembers":10,"maxDocumentsPerAgent":100,"hasCustomBranding":true,"hasApiAccess":true,"hasAutomations":true,"hasAnalytics":true}'),
  ('Enterprise', 'enterprise', -1, -1, -1, '{"maxAgents":-1,"maxChannels":-1,"maxTeamMembers":-1,"maxDocumentsPerAgent":-1,"hasCustomBranding":true,"hasApiAccess":true,"hasAutomations":true,"hasAnalytics":true}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan_id UUID REFERENCES plans(id),
  credits_balance INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- ============================================================
-- AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  personality JSONB NOT NULL DEFAULT '{}',
  ai_config JSONB NOT NULL DEFAULT '{}',
  behavior_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, slug)
);

-- ============================================================
-- AGENT KNOWLEDGE SOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- KNOWLEDGE CHUNKS (vector embeddings)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES agent_knowledge_sources(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS knowledge_chunks_agent_idx ON knowledge_chunks(agent_id);

-- ============================================================
-- CHANNELS
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'disconnected',
  credentials JSONB,
  config JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  channel_type VARCHAR(50),
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, channel_type, external_id)
);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  channel_id UUID NOT NULL REFERENCES channels(id),
  agent_id UUID REFERENCES agents(id),
  assigned_to UUID REFERENCES auth.users(id),
  status VARCHAR(50) DEFAULT 'open',
  kanban_stage VARCHAR(100) DEFAULT 'new',
  mode VARCHAR(50) DEFAULT 'ai',
  subject TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_status_stage_idx
  ON conversations(organization_id, status, kanban_stage);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx
  ON conversations(organization_id, last_message_at DESC);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT,
  content_type VARCHAR(50) DEFAULT 'text',
  media_url TEXT,
  sender_type VARCHAR(50),
  sender_id UUID,
  ai_model VARCHAR(100),
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  delivery_status VARCHAR(50),
  external_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_time_idx
  ON messages(conversation_id, created_at);

-- ============================================================
-- CREDIT TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id UUID,
  reference_type VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_transactions_org_time_idx
  ON credit_transactions(organization_id, created_at DESC);

-- ============================================================
-- CREDIT PACKAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  credits INTEGER NOT NULL,
  bonus_credits INTEGER DEFAULT 0,
  price INTEGER NOT NULL,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO credit_packages (name, credits, bonus_credits, price) VALUES
  ('500 créditos', 500, 0, 1990),
  ('2.000 créditos', 2000, 200, 6990),
  ('10.000 créditos', 10000, 2000, 29900),
  ('50.000 créditos', 50000, 15000, 129900)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AUTOMATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  flow_definition JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  conversation_id UUID REFERENCES conversations(id),
  status VARCHAR(50),
  steps_log JSONB DEFAULT '[]',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's organization IDs
CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Apply RLS policies
CREATE POLICY "users_own_org" ON organizations
  FOR ALL USING (id IN (SELECT get_user_organization_ids()));

CREATE POLICY "org_members_isolation" ON organization_members
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "agents_isolation" ON agents
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "knowledge_sources_isolation" ON agent_knowledge_sources
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "knowledge_chunks_isolation" ON knowledge_chunks
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "channels_isolation" ON channels
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "contacts_isolation" ON contacts
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "conversations_isolation" ON conversations
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "messages_isolation" ON messages
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "credit_transactions_isolation" ON credit_transactions
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

CREATE POLICY "automations_isolation" ON automations
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

-- ============================================================
-- FUNCTION: Auto-create organization on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  free_plan_id UUID;
  company_name TEXT;
  org_slug TEXT;
BEGIN
  company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1));
  org_slug := lower(regexp_replace(company_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substring(gen_random_uuid()::text, 1, 8);

  SELECT id INTO free_plan_id FROM plans WHERE slug = 'free' LIMIT 1;

  INSERT INTO organizations (name, slug, plan_id, credits_balance, trial_ends_at)
  VALUES (
    company_name,
    org_slug,
    free_plan_id,
    100, -- starter credits
    now() + INTERVAL '14 days'
  )
  RETURNING id INTO org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: run on every new Supabase Auth user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
