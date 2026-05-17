ALTER TABLE rates ADD COLUMN IF NOT EXISTS tariff_type VARCHAR(20) NOT NULL DEFAULT 'flat';
ALTER TABLE rates ADD COLUMN IF NOT EXISTS fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS vat_exempt BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS exemption_notes TEXT;

DO $$
BEGIN
  ALTER TABLE rates ADD CONSTRAINT rates_tariff_type_check CHECK (tariff_type IN ('flat', 'block'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE rates ADD CONSTRAINT rates_fixed_charge_amount_check CHECK (fixed_charge_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE rates ADD CONSTRAINT rates_vat_rate_check CHECK (vat_rate >= 0 AND vat_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE rates ADD CONSTRAINT rates_reconnection_fee_amount_check CHECK (reconnection_fee_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tariff_blocks (
  id SERIAL PRIMARY KEY,
  rate_id INTEGER NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  min_units NUMERIC(12, 2) NOT NULL CHECK (min_units >= 0),
  max_units NUMERIC(12, 2) CHECK (max_units > min_units),
  unit_rate NUMERIC(12, 2) NOT NULL CHECK (unit_rate >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tariff_blocks_rate_order ON tariff_blocks(rate_id, sort_order, min_units);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS tariff_snapshot JSONB;

UPDATE bills
SET fixed_charge_amount = COALESCE(fixed_charge_amount, 0),
    vat_amount = COALESCE(vat_amount, 0),
    reconnection_fee_amount = COALESCE(reconnection_fee_amount, 0),
    subtotal_amount = CASE WHEN subtotal_amount = 0 THEN amount ELSE subtotal_amount END,
    total_amount = CASE WHEN total_amount = 0 THEN amount ELSE total_amount END,
    balance_amount = GREATEST(CASE WHEN total_amount = 0 THEN amount ELSE total_amount END - paid_amount, 0);
