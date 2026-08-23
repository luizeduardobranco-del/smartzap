-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Fase 1: Pipelines, Stages, Deals, Deal Notes, Activities
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Pipelines (customizáveis por organização)
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_pipelines_org ON crm_pipelines(organization_id);

-- 2. Stages (etapas de cada pipeline)
CREATE TABLE IF NOT EXISTS crm_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id   UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  position      INTEGER NOT NULL DEFAULT 0,
  is_won        BOOLEAN NOT NULL DEFAULT false,
  is_lost       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_stages_pipeline ON crm_stages(pipeline_id);
CREATE INDEX idx_crm_stages_org ON crm_stages(organization_id);

-- 3. Deals (oportunidades — entidade central)
CREATE TABLE IF NOT EXISTS crm_deals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id          UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE RESTRICT,
  stage_id             UUID NOT NULL REFERENCES crm_stages(id) ON DELETE RESTRICT,
  contact_id           UUID REFERENCES contacts(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  value                NUMERIC(14,2),
  probability          INTEGER CHECK (probability BETWEEN 0 AND 100),
  expected_close_date  DATE,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  lost_reason          TEXT,
  assigned_to          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position             INTEGER NOT NULL DEFAULT 0,
  custom_fields        JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_deals_org       ON crm_deals(organization_id);
CREATE INDEX idx_crm_deals_pipeline  ON crm_deals(pipeline_id);
CREATE INDEX idx_crm_deals_stage     ON crm_deals(stage_id);
CREATE INDEX idx_crm_deals_contact   ON crm_deals(contact_id);
CREATE INDEX idx_crm_deals_status    ON crm_deals(status);

-- 4. Deal Notes
CREATE TABLE IF NOT EXISTS crm_deal_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_deal_notes_deal ON crm_deal_notes(deal_id);

-- 5. Activities (timeline genérica)
CREATE TABLE IF NOT EXISTS crm_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,  -- stage_changed | deal_created | note_added | value_changed | etc.
  data          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_activities_deal    ON crm_activities(deal_id);
CREATE INDEX idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX idx_crm_activities_org     ON crm_activities(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

-- Pipelines
CREATE POLICY "org members can manage pipelines"
  ON crm_pipelines FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Stages
CREATE POLICY "org members can manage stages"
  ON crm_stages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Deals
CREATE POLICY "org members can manage deals"
  ON crm_deals FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Deal Notes
CREATE POLICY "org members can manage deal notes"
  ON crm_deal_notes FOR ALL
  USING (deal_id IN (
    SELECT d.id FROM crm_deals d
    JOIN organization_members om ON om.organization_id = d.organization_id
    WHERE om.user_id = auth.uid()
  ));

-- Activities
CREATE POLICY "org members can view activities"
  ON crm_activities FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: pipeline padrão para organizações existentes
-- ─────────────────────────────────────────────────────────────────────────────

-- Cria pipeline padrão para cada org que ainda não tem
INSERT INTO crm_pipelines (organization_id, name, is_default, position)
SELECT id, 'Pipeline Principal', true, 0
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM crm_pipelines WHERE is_default = true);

-- Cria etapas padrão para cada pipeline recém-criado
INSERT INTO crm_stages (pipeline_id, organization_id, name, color, position, is_won, is_lost)
SELECT
  p.id,
  p.organization_id,
  s.name,
  s.color,
  s.pos,
  s.is_won,
  s.is_lost
FROM crm_pipelines p
CROSS JOIN (
  VALUES
    ('Novo Lead',   '#3b82f6', 0, false, false),
    ('Em Contato',  '#eab308', 1, false, false),
    ('Qualificado', '#8b5cf6', 2, false, false),
    ('Proposta',    '#f97316', 3, false, false),
    ('Fechado',     '#22c55e', 4, true,  false),
    ('Perdido',     '#ef4444', 5, false, true)
) AS s(name, color, pos, is_won, is_lost)
WHERE p.id NOT IN (SELECT pipeline_id FROM crm_stages);

-- Migra kanban_stage dos contacts para deals
-- Só para contatos que têm kanban_stage preenchido
INSERT INTO crm_deals (
  organization_id, pipeline_id, stage_id,
  contact_id, title, status, position, created_at
)
SELECT
  c.organization_id,
  p.id AS pipeline_id,
  st.id AS stage_id,
  c.id AS contact_id,
  COALESCE(c.name, c.phone, 'Lead sem nome') AS title,
  CASE WHEN c.kanban_stage = 'won' THEN 'won'
       WHEN c.kanban_stage = 'lost' THEN 'lost'
       ELSE 'open' END AS status,
  ROW_NUMBER() OVER (PARTITION BY c.organization_id, c.kanban_stage ORDER BY c.created_at) - 1 AS position,
  c.created_at
FROM contacts c
JOIN crm_pipelines p ON p.organization_id = c.organization_id AND p.is_default = true
JOIN crm_stages st ON st.pipeline_id = p.id AND st.name = (
  CASE c.kanban_stage
    WHEN 'new'       THEN 'Novo Lead'
    WHEN 'contacted' THEN 'Em Contato'
    WHEN 'qualified' THEN 'Qualificado'
    WHEN 'proposal'  THEN 'Proposta'
    WHEN 'won'       THEN 'Fechado'
    WHEN 'lost'      THEN 'Perdido'
    ELSE 'Novo Lead'
  END
)
WHERE c.kanban_stage IS NOT NULL
  AND c.id NOT IN (SELECT contact_id FROM crm_deals WHERE contact_id IS NOT NULL);
