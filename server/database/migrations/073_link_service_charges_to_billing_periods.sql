-- Service charge invoices must participate in the same period statement as meter bills.
UPDATE bills b
SET billing_period_id = bp.id
FROM billing_periods bp
WHERE b.bill_origin = 'service_charge'
  AND b.billing_period_id IS NULL
  AND b.billing_month >= bp.period_start
  AND b.billing_month <= bp.period_end;
