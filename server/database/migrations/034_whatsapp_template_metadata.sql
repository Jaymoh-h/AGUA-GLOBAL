ALTER TABLE communication_templates
  ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS whatsapp_template_language VARCHAR(20) NOT NULL DEFAULT 'en_US',
  ADD COLUMN IF NOT EXISTS whatsapp_template_variables JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_communication_templates_whatsapp_name
  ON communication_templates(whatsapp_template_name)
  WHERE whatsapp_template_name IS NOT NULL;
