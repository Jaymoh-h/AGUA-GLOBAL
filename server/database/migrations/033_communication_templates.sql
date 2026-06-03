CREATE TABLE IF NOT EXISTS communication_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  alert_type VARCHAR(40) NOT NULL DEFAULT 'invoice_alert'
    CHECK (alert_type IN ('invoice_alert')),
  medium VARCHAR(30) NOT NULL
    CHECK (medium IN ('email', 'sms', 'whatsapp')),
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_templates_name_medium
  ON communication_templates(LOWER(name), medium, alert_type);

CREATE INDEX IF NOT EXISTS idx_communication_templates_medium
  ON communication_templates(medium, alert_type, is_default DESC, name ASC);
