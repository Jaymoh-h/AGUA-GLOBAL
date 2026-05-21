ALTER TABLE billing_settings DROP CONSTRAINT IF EXISTS billing_settings_penalty_type_check;
ALTER TABLE billing_settings
  ADD CONSTRAINT billing_settings_penalty_type_check CHECK (penalty_type IN ('none', 'fixed', 'percentage'));

ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS penalty_type VARCHAR(20);
ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS penalty_value NUMERIC(12, 2);
ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(12, 2);
ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS waived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ;
ALTER TABLE bill_penalty_applications ADD COLUMN IF NOT EXISTS waiver_reason TEXT;

UPDATE bill_penalty_applications
SET penalty_type = COALESCE(penalty_type, 'fixed'),
    penalty_value = COALESCE(penalty_value, amount),
    principal_amount = COALESCE(principal_amount, amount)
WHERE penalty_type IS NULL OR penalty_value IS NULL OR principal_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_bill_penalty_applications_waived_at ON bill_penalty_applications(waived_at);
