CREATE TABLE IF NOT EXISTS bill_penalty_applications (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  application_month DATE NOT NULL,
  applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, application_month)
);

CREATE INDEX IF NOT EXISTS idx_bill_penalty_applications_bill_id ON bill_penalty_applications(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_penalty_applications_application_month ON bill_penalty_applications(application_month DESC);
