UPDATE bills b
SET bill_pay_status = 'held',
    payability_reason = COALESCE(
      b.payability_reason,
      'Held pending explicit source bill promotion after source-first workflow hardening'
    ),
    promoted_by = NULL,
    promoted_at = NULL
WHERE b.billing_source = 'source_backup'
  AND b.bill_pay_status = 'payable'
  AND COALESCE(b.paid_amount, 0) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM payment_allocations pa
    WHERE pa.bill_id = b.id
  );
