ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(80) UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(30) NOT NULL DEFAULT 'cash'
  CHECK (payment_channel IN ('cash', 'bank', 'mpesa_paybill', 'manual_adjustment'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_reference VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS received_from VARCHAR(160);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'posted'
  CHECK (status IN ('posted', 'void'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS total_allocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_allocated_amount >= 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, bill_id)
);

UPDATE payments
SET payment_channel = CASE
      WHEN method = 'mobile_money' THEN 'mpesa_paybill'
      WHEN method IN ('cash', 'bank') THEN method
      ELSE 'cash'
    END,
    external_reference = COALESCE(external_reference, reference),
    total_allocated_amount = CASE
      WHEN total_allocated_amount = 0 THEN amount
      ELSE total_allocated_amount
    END,
    status = COALESCE(status, 'posted'),
    updated_at = NOW();

UPDATE payments
SET receipt_number = 'RCPT-' || LPAD(id::text, 6, '0')
WHERE receipt_number IS NULL;

INSERT INTO payment_allocations (payment_id, bill_id, amount)
SELECT id, bill_id, amount
FROM payments
WHERE bill_id IS NOT NULL
ON CONFLICT (payment_id, bill_id) DO UPDATE
SET amount = EXCLUDED.amount;

CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_bill_id ON payment_allocations(bill_id);
