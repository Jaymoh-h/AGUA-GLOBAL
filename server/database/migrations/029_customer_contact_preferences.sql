ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email VARCHAR(160),
  ADD COLUMN IF NOT EXISTS preferred_delivery_channel VARCHAR(30) NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS email_delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_preferred_delivery_channel_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_preferred_delivery_channel_check
      CHECK (preferred_delivery_channel IN ('email', 'sms', 'whatsapp'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
