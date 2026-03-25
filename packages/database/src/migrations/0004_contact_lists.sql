-- ============================================================
-- CONTACT LISTS + MEMBERS
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  color VARCHAR(20) DEFAULT '#6366f1',
  list_type VARCHAR(100) DEFAULT '',   -- ex: Tatuadores, Médicos, Dentistas
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_list_members (
  list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS contact_lists_org_idx ON contact_lists(organization_id);
CREATE INDEX IF NOT EXISTS contact_list_members_list_idx ON contact_list_members(list_id);
CREATE INDEX IF NOT EXISTS contact_list_members_contact_idx ON contact_list_members(contact_id);

-- RLS
ALTER TABLE contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_contact_lists" ON contact_lists
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_isolation_contact_list_members" ON contact_list_members
  USING (list_id IN (
    SELECT id FROM contact_lists WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));
