ALTER TABLE communication_campaigns
  ADD COLUMN IF NOT EXISTS zone_name VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_communication_campaigns_zone_created
  ON communication_campaigns(zone_name, created_at DESC)
  WHERE zone_name IS NOT NULL;
