-- Add duration fields to coupons
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS duration VARCHAR(20) DEFAULT 'forever', -- 'once' | 'forever'
  ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT NULL;    -- future: N months
