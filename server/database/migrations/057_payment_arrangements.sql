CREATE TABLE IF NOT EXISTS payment_arrangements (
  id SERIAL PRIMARY KEY,
  arrangement_number VARCHAR(40) UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  maintenance_request_id INTEGER REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  agreed_amount NUMERIC(12, 2) NOT NULL CHECK (agreed_amount > 0),
  installment_amount NUMERIC(12, 2) NOT NULL CHECK (installment_amount > 0),
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  first_due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted', 'cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closure_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_arrangements_one_active_customer
  ON payment_arrangements(customer_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_payment_arrangements_status_due
  ON payment_arrangements(status, first_due_date);

CREATE INDEX IF NOT EXISTS idx_payment_arrangements_customer
  ON payment_arrangements(customer_id, created_at DESC);
