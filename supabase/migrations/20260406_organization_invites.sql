-- Organization invites table
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  UNIQUE(organization_id, email)
);

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_org_isolation" ON organization_invites
  FOR ALL USING (organization_id IN (SELECT get_user_organization_ids()));

-- Allow reading invite by token (unauthenticated, for accept flow)
CREATE POLICY "invites_read_by_token" ON organization_invites
  FOR SELECT USING (true);

-- Add profile info to members via auth.users view helper
CREATE OR REPLACE FUNCTION get_org_members_with_email(p_org_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  role VARCHAR,
  joined_at TIMESTAMPTZ,
  email TEXT,
  raw_user_meta_data JSONB
) AS $$
  SELECT
    om.id,
    om.user_id,
    om.role,
    om.joined_at,
    au.email,
    au.raw_user_meta_data
  FROM organization_members om
  JOIN auth.users au ON au.id = om.user_id
  WHERE om.organization_id = p_org_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;
