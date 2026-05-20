ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS bill_number_prefix VARCHAR(24) NOT NULL DEFAULT 'BILL';
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS bill_number_next INTEGER NOT NULL DEFAULT 1 CHECK (bill_number_next > 0);
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS receipt_number_prefix VARCHAR(24) NOT NULL DEFAULT 'RCPT';
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS receipt_number_next INTEGER NOT NULL DEFAULT 1 CHECK (receipt_number_next > 0);
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS number_padding INTEGER NOT NULL DEFAULT 6 CHECK (number_padding BETWEEN 3 AND 12);

UPDATE billing_settings
SET bill_number_next = GREATEST(
      bill_number_next,
      COALESCE((SELECT COUNT(*)::integer + 1 FROM bills WHERE bill_number IS NOT NULL AND bill_number NOT LIKE 'MIG-%'), 1)
    ),
    receipt_number_next = GREATEST(
      receipt_number_next,
      COALESCE((SELECT COUNT(*)::integer + 1 FROM payments WHERE receipt_number IS NOT NULL), 1)
    );
