CREATE TABLE IF NOT EXISTS payroll_payees (
  id SERIAL PRIMARY KEY,
  payee_type VARCHAR(30) NOT NULL
    CHECK (payee_type IN ('employee', 'casual', 'contractor', 'subscription')),
  name VARCHAR(160) NOT NULL,
  code VARCHAR(60) UNIQUE,
  title VARCHAR(120),
  rate_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rate_amount >= 0),
  rate_basis VARCHAR(30) NOT NULL DEFAULT 'monthly'
    CHECK (rate_basis IN ('monthly', 'daily', 'hourly', 'invoice', 'subscription')),
  default_additions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (default_additions >= 0),
  default_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (default_deductions >= 0),
  payment_channel VARCHAR(30) NOT NULL DEFAULT 'bank'
    CHECK (payment_channel IN ('cash', 'bank', 'mpesa_paybill', 'manual_adjustment')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'locked', 'cancelled')),
  total_gross NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_gross >= 0),
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  total_net NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_net >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
  id SERIAL PRIMARY KEY,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  payee_id INTEGER NOT NULL REFERENCES payroll_payees(id) ON DELETE RESTRICT,
  payee_type VARCHAR(30) NOT NULL
    CHECK (payee_type IN ('employee', 'casual', 'contractor', 'subscription')),
  source_units NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (source_units >= 0),
  gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  additions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (additions >= 0),
  deductions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'held', 'cancelled')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, payee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_payees_type_status ON payroll_payees(payee_type, status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period_status ON payroll_runs(period_start DESC, status);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_run ON payroll_line_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_payee ON payroll_line_items(payee_id);
