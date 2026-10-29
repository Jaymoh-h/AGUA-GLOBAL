CREATE TABLE IF NOT EXISTS customer_deposit_receipts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(80) NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_channel VARCHAR(30) NOT NULL DEFAULT 'cash'
    CHECK (payment_channel IN ('cash', 'bank', 'mpesa_paybill')),
  external_reference VARCHAR(120),
  received_from VARCHAR(160),
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_deposit_receipts_channel_reference
  ON customer_deposit_receipts (payment_channel, LOWER(BTRIM(external_reference)))
  WHERE payment_channel IN ('bank', 'mpesa_paybill')
    AND NULLIF(BTRIM(external_reference), '') IS NOT NULL;
