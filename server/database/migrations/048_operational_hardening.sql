CREATE TABLE IF NOT EXISTS backup_restore_drills (
  id SERIAL PRIMARY KEY,
  drill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  environment VARCHAR(40) NOT NULL DEFAULT 'staging'
    CHECK (environment IN ('local', 'staging', 'production')),
  backup_reference TEXT NOT NULL,
  restore_target TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'passed', 'partial', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  dataset_count INTEGER CHECK (dataset_count IS NULL OR dataset_count >= 0),
  findings TEXT,
  follow_up_actions TEXT,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_drills_date
  ON backup_restore_drills(drill_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS monitoring_alert_logs (
  id SERIAL PRIMARY KEY,
  alert_key VARCHAR(160) NOT NULL,
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'skipped', 'failed')),
  subject TEXT,
  message TEXT,
  error_message TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_alert_logs_key_sent
  ON monitoring_alert_logs(alert_key, sent_at DESC);
