CREATE TABLE IF NOT EXISTS integration_commissioning_checks (
  id SERIAL PRIMARY KEY,
  check_key VARCHAR(60) NOT NULL CHECK (check_key IN (
    'messaging_email',
    'messaging_sms',
    'messaging_whatsapp',
    'mpesa_settlement',
    'bank_feed',
    'database_resilience',
    'external_uptime'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'passed', 'partial', 'failed')),
  verification_date DATE NOT NULL DEFAULT CURRENT_DATE,
  evidence_reference VARCHAR(240),
  findings TEXT,
  follow_up_actions TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_commissioning_checks_key_date
  ON integration_commissioning_checks(check_key, verification_date DESC, id DESC);
