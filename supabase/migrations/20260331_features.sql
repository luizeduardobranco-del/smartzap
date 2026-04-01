-- ============================================================
-- Migration: features 2026-03-31
-- 1. daily_limit para campanhas
-- 2. tabela coupons
-- 3. tabela referral_codes + referrals
-- ============================================================

-- Feature 1: limite diário de disparos
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT NULL;

-- Feature 2: cupons de desconto
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed'
  value NUMERIC(10,2) NOT NULL,
  applicable_to VARCHAR(20) DEFAULT 'all',        -- 'all' | 'plan' | 'credits'
  max_uses INTEGER DEFAULT NULL,
  uses_count INTEGER DEFAULT 0,
  valid_until TIMESTAMPTZ DEFAULT NULL,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code)
);

-- Feature 3: programa de afiliados
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  commission_rate NUMERIC(5,2) DEFAULT 20.00,
  total_referrals INTEGER DEFAULT 0,
  total_earned NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id),
  referrer_org_id UUID NOT NULL REFERENCES organizations(id),
  referred_user_id UUID REFERENCES auth.users(id),
  referred_org_id UUID REFERENCES organizations(id),
  code VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',           -- 'pending' | 'converted' | 'paid'
  commission_amount NUMERIC(10,2) DEFAULT 0,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
