ALTER TABLE meters ADD COLUMN IF NOT EXISTS meter_role VARCHAR(30) NOT NULL DEFAULT 'client_billing';
ALTER TABLE meters DROP CONSTRAINT IF EXISTS meters_meter_role_check;
ALTER TABLE meters
  ADD CONSTRAINT meters_meter_role_check
  CHECK (meter_role IN ('client_billing', 'source_backup', 'shared_source_monitoring'));

UPDATE meters
SET meter_role = 'client_billing'
WHERE meter_role IS NULL;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS billing_meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS billing_meter_role VARCHAR(30) NOT NULL DEFAULT 'client_billing';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS billing_source VARCHAR(30) NOT NULL DEFAULT 'client_meter';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS source_fallback_reason TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS source_billing_request_id INTEGER;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_billing_meter_role_check;
ALTER TABLE bills
  ADD CONSTRAINT bills_billing_meter_role_check
  CHECK (billing_meter_role IN ('client_billing', 'source_backup', 'shared_source_monitoring'));
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_billing_source_check;
ALTER TABLE bills
  ADD CONSTRAINT bills_billing_source_check
  CHECK (billing_source IN ('client_meter', 'source_backup'));

UPDATE bills b
SET billing_meter_id = COALESCE(billing_meter_id, mr.meter_id),
    billing_meter_role = COALESCE(m.meter_role, billing_meter_role, 'client_billing'),
    billing_source = CASE WHEN COALESCE(m.meter_role, 'client_billing') = 'source_backup' THEN 'source_backup' ELSE 'client_meter' END
FROM meter_readings mr
LEFT JOIN meters m ON m.id = mr.meter_id
WHERE mr.id = b.current_reading_id
  AND b.billing_meter_id IS NULL;

CREATE TABLE IF NOT EXISTS source_billing_requests (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  current_reading_id INTEGER UNIQUE NOT NULL REFERENCES meter_readings(id) ON DELETE CASCADE,
  previous_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(12, 2) NOT NULL,
  units_used NUMERIC(12, 2) NOT NULL CHECK (units_used >= 0),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  tariff_snapshot JSONB,
  due_date DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_source_billing_request_id_fkey;
ALTER TABLE bills
  ADD CONSTRAINT bills_source_billing_request_id_fkey
  FOREIGN KEY (source_billing_request_id) REFERENCES source_billing_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meters_customer_role_status ON meters(customer_id, meter_role, status);
CREATE INDEX IF NOT EXISTS idx_bills_billing_meter_id ON bills(billing_meter_id);
CREATE INDEX IF NOT EXISTS idx_source_billing_requests_status ON source_billing_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_billing_requests_customer ON source_billing_requests(customer_id, created_at DESC);
