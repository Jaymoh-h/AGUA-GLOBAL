ALTER TABLE payroll_line_items
  ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payroll_line_items_expense ON payroll_line_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_paid_at ON payroll_line_items(paid_at DESC);
