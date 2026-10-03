ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS allocation_mode VARCHAR(20) NOT NULL DEFAULT 'automatic'
    CHECK (allocation_mode IN ('automatic', 'targeted')),
  ADD COLUMN IF NOT EXISTS target_bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL;
