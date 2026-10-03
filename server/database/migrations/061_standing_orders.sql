CREATE TABLE IF NOT EXISTS standing_orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  mandate_reference VARCHAR(80) NOT NULL,
  expected_amount NUMERIC(12, 2) NOT NULL CHECK (expected_amount > 0),
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  first_due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_standing_orders_mandate_reference
  ON standing_orders(LOWER(mandate_reference));

CREATE UNIQUE INDEX IF NOT EXISTS idx_standing_orders_one_active_customer
  ON standing_orders(customer_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_standing_orders_status_due
  ON standing_orders(status, first_due_date);

CREATE INDEX IF NOT EXISTS idx_standing_orders_customer
  ON standing_orders(customer_id, created_at DESC);
