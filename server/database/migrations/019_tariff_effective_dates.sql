ALTER TABLE rates ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT DATE '1900-01-01';

CREATE TABLE IF NOT EXISTS rate_versions (
  id SERIAL PRIMARY KEY,
  rate_id INTEGER NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  name VARCHAR(120) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  tariff_type VARCHAR(20) NOT NULL DEFAULT 'flat' CHECK (tariff_type IN ('flat', 'block')),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  exemption_notes TEXT,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rate_id, effective_from)
);

CREATE TABLE IF NOT EXISTS rate_version_blocks (
  id SERIAL PRIMARY KEY,
  rate_version_id INTEGER NOT NULL REFERENCES rate_versions(id) ON DELETE CASCADE,
  min_units NUMERIC(12, 2) NOT NULL CHECK (min_units >= 0),
  max_units NUMERIC(12, 2) CHECK (max_units > min_units),
  unit_rate NUMERIC(12, 2) NOT NULL CHECK (unit_rate >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rate_versions (
  rate_id, effective_from, name, amount, tariff_type, fixed_charge_amount,
  vat_enabled, vat_rate, vat_exempt, reconnection_fee_amount, exemption_notes, description
)
SELECT
  id, effective_from, name, amount, tariff_type, fixed_charge_amount,
  vat_enabled, vat_rate, vat_exempt, reconnection_fee_amount, exemption_notes, description
FROM rates
ON CONFLICT (rate_id, effective_from) DO NOTHING;

INSERT INTO rate_version_blocks (rate_version_id, min_units, max_units, unit_rate, sort_order)
SELECT rv.id, tb.min_units, tb.max_units, tb.unit_rate, tb.sort_order
FROM rate_versions rv
JOIN tariff_blocks tb ON tb.rate_id = rv.rate_id
WHERE NOT EXISTS (
  SELECT 1
  FROM rate_version_blocks rvb
  WHERE rvb.rate_version_id = rv.id
);

CREATE INDEX IF NOT EXISTS idx_rate_versions_rate_effective ON rate_versions(rate_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_rate_version_blocks_version_order ON rate_version_blocks(rate_version_id, sort_order, min_units);
