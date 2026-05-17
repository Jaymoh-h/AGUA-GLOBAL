INSERT INTO bills (
  customer_id, bill_number, billing_month, previous_reading, current_reading,
  units_used, rate, amount, subtotal_amount, total_amount, balance_amount,
  paid_amount, status, due_date, issued_at
)
SELECT
  c.id,
  'MIG-' || c.id::text,
  c.opening_balance_date,
  0,
  0,
  0,
  0,
  c.opening_balance_amount,
  c.opening_balance_amount,
  c.opening_balance_amount,
  c.opening_balance_amount,
  0,
  'unpaid',
  c.opening_balance_date,
  NOW()
FROM customers c
WHERE c.opening_balance_amount > 0
  AND c.opening_balance_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM bills b
    WHERE b.customer_id = c.id
      AND b.bill_number = 'MIG-' || c.id::text
  );
