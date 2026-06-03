ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS maintenance_request_id INTEGER REFERENCES maintenance_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_maintenance_request ON expenses(maintenance_request_id, expense_date DESC);
