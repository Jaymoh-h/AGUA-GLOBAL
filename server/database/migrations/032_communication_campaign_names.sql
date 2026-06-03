ALTER TABLE communication_campaigns
  ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(160);

UPDATE communication_campaigns
SET campaign_name = COALESCE(
  NULLIF(TRIM(campaign_name), ''),
  CONCAT('Invoice alert - ', UPPER(medium), ' - ', TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI'))
)
WHERE campaign_name IS NULL OR TRIM(campaign_name) = '';

ALTER TABLE communication_campaigns
  ALTER COLUMN campaign_name SET DEFAULT 'Invoice alert';

ALTER TABLE communication_campaigns
  ALTER COLUMN campaign_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_campaigns_name
  ON communication_campaigns(campaign_name);
