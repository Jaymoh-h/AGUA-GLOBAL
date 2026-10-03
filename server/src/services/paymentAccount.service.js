// Only pass SQL expressions defined in source code, never request values.
const accountPaymentJoin = (customerExpression) => `
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount), 0) AS allocated_amount,
           STRING_AGG(DISTINCT ab.bill_number, ', ' ORDER BY ab.bill_number) AS bill_numbers
    FROM payment_allocations a
    JOIN bills ab ON ab.id = a.bill_id
    WHERE a.payment_id = p.id AND ab.customer_id = ${customerExpression}
  ) account_allocations
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN p.customer_id = ${customerExpression}
              AND COALESCE(p.allocation_mode, 'automatic') <> 'cross_account' THEN p.amount
             ELSE account_allocations.allocated_amount +
                  CASE WHEN p.customer_id = ${customerExpression} THEN COALESCE(p.unallocated_amount, 0) ELSE 0 END
           END AS amount,
           account_allocations.allocated_amount AS total_allocated_amount,
           CASE WHEN p.customer_id = ${customerExpression} THEN COALESCE(p.unallocated_amount, 0) ELSE 0 END AS unallocated_amount,
           account_allocations.bill_numbers
  ) account_payment`;

module.exports = { accountPaymentJoin };
