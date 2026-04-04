-- ============================================================
-- Migration: Stories / Status WhatsApp & Instagram — 2026-04-04
-- ============================================================

CREATE TABLE IF NOT EXISTS story_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id        UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  channel_type      VARCHAR(20)  NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' | 'instagram'
  media_type        VARCHAR(20)  NOT NULL DEFAULT 'image',    -- 'image' | 'video' | 'text'
  media_url         TEXT,
  caption           TEXT,
  background_color  VARCHAR(7)   DEFAULT '#000000',
  status            VARCHAR(20)  NOT NULL DEFAULT 'draft',    -- 'draft' | 'scheduled' | 'sent' | 'failed'
  scheduled_at      TIMESTAMPTZ,
  repeat_days       INTEGER[],   -- [0..6] (0=Dom .. 6=Sab); NULL = sem repetição
  repeat_time       TIME,        -- hora do disparo quando repeat_days está definido
  sent_at           TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_story_posts_org       ON story_posts (organization_id);
CREATE INDEX IF NOT EXISTS idx_story_posts_scheduled ON story_posts (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_story_posts_status    ON story_posts (status);

-- RLS
ALTER TABLE story_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage story_posts"
  ON story_posts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_story_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_story_posts_updated_at
  BEFORE UPDATE ON story_posts
  FOR EACH ROW EXECUTE FUNCTION update_story_posts_updated_at();
