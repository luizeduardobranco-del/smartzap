-- Add Asaas payment gateway fields to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_asaas_customer_id
  ON organizations(asaas_customer_id);

CREATE INDEX IF NOT EXISTS idx_organizations_asaas_subscription_id
  ON organizations(asaas_subscription_id);
