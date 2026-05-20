ALTER TABLE customers ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closure_bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closure_reason TEXT;

CREATE TABLE IF NOT EXISTS customer_deposit_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL CHECK (action IN ('applied', 'refunded', 'forfeited', 'transferred')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_adjustments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_deposit_transactions_customer ON customer_deposit_transactions(customer_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_adjustments_status ON customer_adjustments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_adjustments_customer ON customer_adjustments(customer_id, created_at DESC);
