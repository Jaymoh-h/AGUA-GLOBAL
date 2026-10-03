CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_channel_external_reference_posted
  ON payments (payment_channel, LOWER(BTRIM(external_reference)))
  WHERE status = 'posted'
    AND payment_channel IN ('bank', 'mpesa_paybill')
    AND NULLIF(BTRIM(external_reference), '') IS NOT NULL;
