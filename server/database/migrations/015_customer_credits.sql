ALTER TABLE payments ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0);

UPDATE payments
SET unallocated_amount = GREATEST(amount - COALESCE(total_allocated_amount, 0), 0)
WHERE status = 'posted';
