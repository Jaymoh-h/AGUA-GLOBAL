CREATE TABLE IF NOT EXISTS operational_reminder_logs (
  id SERIAL PRIMARY KEY,
  reminder_type VARCHAR(60) NOT NULL,
  reminder_key VARCHAR(160) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'skipped', 'failed')),
  summary JSONB,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_reminder_logs_unique_send
  ON operational_reminder_logs(reminder_type, reminder_key, recipient_email);

CREATE INDEX IF NOT EXISTS idx_operational_reminder_logs_sent_at
  ON operational_reminder_logs(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_reminder_logs_recipient
  ON operational_reminder_logs(recipient_user_id, sent_at DESC);
