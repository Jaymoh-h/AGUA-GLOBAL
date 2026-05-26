ALTER TABLE production_electricity_topups
  ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_electricity_topups_expense ON production_electricity_topups(expense_id);
