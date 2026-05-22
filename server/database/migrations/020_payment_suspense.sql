ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('posted', 'void', 'voided_to_suspense'));

CREATE TABLE IF NOT EXISTS payment_suspense_items (
  id SERIAL PRIMARY KEY,
  source_payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  receipt_number VARCHAR(80),
  payment_channel VARCHAR(30),
  external_reference VARCHAR(120),
  received_from VARCHAR(160),
  payment_date DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'reapplied', 'discarded')),
  reapplied_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  discard_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_suspense_status ON payment_suspense_items(status);
CREATE INDEX IF NOT EXISTS idx_payment_suspense_source_payment ON payment_suspense_items(source_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_suspense_customer ON payment_suspense_items(customer_id);
