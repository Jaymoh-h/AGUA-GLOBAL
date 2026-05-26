ALTER TABLE payroll_payees
  ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(30) NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS terminated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;

ALTER TABLE payroll_payees DROP CONSTRAINT IF EXISTS payroll_payees_recurrence_type_check;
ALTER TABLE payroll_payees
  ADD CONSTRAINT payroll_payees_recurrence_type_check
  CHECK (recurrence_type IN ('recurring', 'period_only'));

ALTER TABLE payroll_payees DROP CONSTRAINT IF EXISTS payroll_payees_status_check;
ALTER TABLE payroll_payees
  ADD CONSTRAINT payroll_payees_status_check
  CHECK (status IN ('active', 'inactive', 'terminated'));

UPDATE payroll_payees
SET recurrence_type = CASE
    WHEN payee_type IN ('employee', 'subscription') THEN 'recurring'
    ELSE 'period_only'
  END,
  start_date = COALESCE(start_date, created_at::date, CURRENT_DATE);

ALTER TABLE payroll_line_items
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'auto_recurring',
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payroll_line_items DROP CONSTRAINT IF EXISTS payroll_line_items_source_type_check;
ALTER TABLE payroll_line_items
  ADD CONSTRAINT payroll_line_items_source_type_check
  CHECK (source_type IN ('auto_recurring', 'manual_period'));

UPDATE payroll_line_items pli
SET source_type = CASE
    WHEN pp.recurrence_type = 'period_only' THEN 'manual_period'
    ELSE 'auto_recurring'
  END
FROM payroll_payees pp
WHERE pp.id = pli.payee_id;

CREATE INDEX IF NOT EXISTS idx_payroll_payees_recurrence_status ON payroll_payees(recurrence_type, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_source_type ON payroll_line_items(payroll_run_id, source_type);
