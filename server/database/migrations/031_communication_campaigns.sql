CREATE TABLE IF NOT EXISTS communication_campaigns (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(40) NOT NULL DEFAULT 'invoice_alert'
    CHECK (alert_type IN ('invoice_alert')),
  medium VARCHAR(30) NOT NULL
    CHECK (medium IN ('email', 'sms', 'whatsapp')),
  template TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  recipient VARCHAR(180),
  status VARCHAR(30) NOT NULL
    CHECK (status IN ('sent', 'skipped', 'failed')),
  error_message TEXT,
  delivery_log_id INTEGER REFERENCES document_delivery_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communication_campaigns_created
  ON communication_campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_campaign_recipients_campaign
  ON communication_campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_communication_campaign_recipients_customer
  ON communication_campaign_recipients(customer_id, created_at DESC);
