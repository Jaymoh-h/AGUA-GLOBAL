CREATE TABLE IF NOT EXISTS billing_periods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  period_start DATE UNIQUE NOT NULL,
  period_end DATE NOT NULL,
  closing_date DATE NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'locked')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (closing_date >= period_start),
  CHECK (bill_date >= period_start),
  CHECK (due_date >= bill_date)
);

CREATE TABLE IF NOT EXISTS billing_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  due_rule VARCHAR(40) NOT NULL DEFAULT 'next_month_end' CHECK (due_rule IN ('next_month_end')),
  penalty_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (penalty_grace_days >= 0),
  penalty_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (penalty_type IN ('none', 'fixed')),
  penalty_value NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (penalty_value >= 0),
  deposit_required BOOLEAN NOT NULL DEFAULT FALSE,
  default_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (default_deposit_amount >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deposit_paid_at DATE;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_number VARCHAR(80) UNIQUE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS deposit_applied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_applied_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

INSERT INTO billing_periods (name, period_start, period_end, closing_date, bill_date, due_date, status)
SELECT DISTINCT
  to_char(date_trunc('month', billing_month)::date, 'FMMonth YYYY') AS name,
  date_trunc('month', billing_month)::date AS period_start,
  (date_trunc('month', billing_month)::date + INTERVAL '1 month - 1 day')::date AS period_end,
  (date_trunc('month', billing_month)::date + INTERVAL '1 month - 1 day')::date AS closing_date,
  (date_trunc('month', billing_month)::date + INTERVAL '1 month - 1 day')::date AS bill_date,
  (date_trunc('month', billing_month)::date + INTERVAL '2 months - 1 day')::date AS due_date,
  'open' AS status
FROM bills
WHERE billing_month IS NOT NULL
ON CONFLICT (period_start) DO UPDATE
SET name = EXCLUDED.name,
    period_end = EXCLUDED.period_end,
    closing_date = EXCLUDED.closing_date,
    bill_date = EXCLUDED.bill_date,
    due_date = EXCLUDED.due_date,
    updated_at = NOW();

UPDATE bills b
SET billing_period_id = bp.id,
    subtotal_amount = CASE WHEN b.subtotal_amount = 0 THEN b.amount ELSE b.subtotal_amount END,
    total_amount = CASE WHEN b.total_amount = 0 THEN b.amount ELSE b.total_amount END,
    balance_amount = GREATEST(
      CASE WHEN b.total_amount = 0 THEN b.amount ELSE b.total_amount END - b.paid_amount,
      0
    ),
    due_date = bp.due_date,
    issued_at = COALESCE(b.issued_at, b.created_at),
    bill_number = COALESCE(
      b.bill_number,
      'BILL-' || to_char(bp.period_start, 'YYYYMM') || '-' || c.acc_number || '-' || b.id::text
    )
FROM billing_periods bp
JOIN customers c ON TRUE
WHERE c.id = b.customer_id
  AND bp.period_start = date_trunc('month', b.billing_month)::date;

CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON billing_periods(status);
CREATE INDEX IF NOT EXISTS idx_bills_billing_period_id ON bills(billing_period_id);
