CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash TEXT PRIMARY KEY,
  scope VARCHAR(80) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
  ON rate_limit_buckets(reset_at);

