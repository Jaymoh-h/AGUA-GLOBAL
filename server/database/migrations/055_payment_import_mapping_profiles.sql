CREATE TABLE IF NOT EXISTS payment_import_mapping_profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  payment_channel VARCHAR(30) NOT NULL CHECK (payment_channel IN ('bank', 'mpesa_paybill')),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_import_mapping_profiles_channel_name
  ON payment_import_mapping_profiles (payment_channel, LOWER(BTRIM(name)));
