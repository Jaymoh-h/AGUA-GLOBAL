CREATE TABLE IF NOT EXISTS monthly_budget_targets (
  id SERIAL PRIMARY KEY,
  budget_month DATE NOT NULL,
  revenue_target NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (revenue_target >= 0),
  collection_target NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (collection_target >= 0),
  operating_expense_budget NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (operating_expense_budget >= 0),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monthly_budget_targets_month_start_check
    CHECK (budget_month = date_trunc('month', budget_month)::date),
  CONSTRAINT monthly_budget_targets_month_unique UNIQUE (budget_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_budget_targets_month
  ON monthly_budget_targets(budget_month DESC);
