CREATE TABLE IF NOT EXISTS system_event_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source VARCHAR(40) NOT NULL DEFAULT 'server'
    CHECK (source IN ('server', 'client', 'database', 'auth', 'scheduler')),
  message TEXT NOT NULL,
  details JSONB,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  method VARCHAR(12),
  path TEXT,
  status_code INTEGER,
  ip_address VARCHAR(80),
  user_agent TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_created_at
  ON system_event_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_type_created
  ON system_event_logs(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_severity_created
  ON system_event_logs(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_event_logs_unresolved
  ON system_event_logs(severity, created_at DESC)
  WHERE resolved_at IS NULL;
