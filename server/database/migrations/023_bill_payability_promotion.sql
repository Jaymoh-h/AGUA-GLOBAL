ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_pay_status VARCHAR(20) NOT NULL DEFAULT 'payable';
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_pay_status_check;
ALTER TABLE bills
  ADD CONSTRAINT bills_bill_pay_status_check
  CHECK (bill_pay_status IN ('payable', 'held', 'superseded'));

ALTER TABLE bills ADD COLUMN IF NOT EXISTS payability_reason TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS promoted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

UPDATE bills
SET bill_pay_status = 'payable'
WHERE bill_pay_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_bills_customer_period_pay_status ON bills(customer_id, billing_period_id, bill_pay_status);
