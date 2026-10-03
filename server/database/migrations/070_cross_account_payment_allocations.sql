ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_allocation_mode_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_allocation_mode_check
    CHECK (allocation_mode IN ('automatic', 'targeted', 'cross_account'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS allocation_plan JSONB NOT NULL DEFAULT '[]'::jsonb;
