INSERT INTO rates (name, amount, description)
VALUES
  ('Domestic', 75.00, 'Default household water tariff'),
  ('Commercial', 85.00, 'Small business and commercial customer tariff'),
  ('Institutional', 70.00, 'Schools, clinics, and community institutions')
ON CONFLICT (name) DO UPDATE
SET amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO zones (name, description)
VALUES
  ('Zone A - Market Road', 'Market Road customer route'),
  ('Zone B - Main Street', 'Main Street customer route'),
  ('Zone C - Hill View', 'Hill View customer route')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO customers (name, phone, location, acc_number, rate, rate_id, zone_id)
VALUES
  (
    'Jane Wanjiku', '+254711111111', 'Zone A - Market Road', 'AG-0001', 75.00,
    (SELECT id FROM rates WHERE name = 'Domestic'),
    (SELECT id FROM zones WHERE name = 'Zone A - Market Road')
  ),
  (
    'Kiptoo Stores', '+254722222222', 'Zone B - Main Street', 'AG-0002', 85.00,
    (SELECT id FROM rates WHERE name = 'Commercial'),
    (SELECT id FROM zones WHERE name = 'Zone B - Main Street')
  ),
  (
    'Green Valley School', '+254733333333', 'Zone C - Hill View', 'AG-0003', 70.00,
    (SELECT id FROM rates WHERE name = 'Institutional'),
    (SELECT id FROM zones WHERE name = 'Zone C - Hill View')
  )
ON CONFLICT (acc_number) DO NOTHING;

UPDATE customers
SET rate_id = CASE
      WHEN acc_number = 'AG-0001' THEN (SELECT id FROM rates WHERE name = 'Domestic')
      WHEN acc_number = 'AG-0002' THEN (SELECT id FROM rates WHERE name = 'Commercial')
      WHEN acc_number = 'AG-0003' THEN (SELECT id FROM rates WHERE name = 'Institutional')
      ELSE rate_id
    END,
    zone_id = CASE
      WHEN acc_number = 'AG-0001' THEN (SELECT id FROM zones WHERE name = 'Zone A - Market Road')
      WHEN acc_number = 'AG-0002' THEN (SELECT id FROM zones WHERE name = 'Zone B - Main Street')
      WHEN acc_number = 'AG-0003' THEN (SELECT id FROM zones WHERE name = 'Zone C - Hill View')
      ELSE zone_id
    END;

INSERT INTO users (name, email, phone, role, customer_id, password_hash)
VALUES
  ('System Admin', 'admin@agua.local', '+254700000001', 'admin', NULL, crypt('Admin@123', gen_salt('bf'))),
  ('Mary Meter Reader', 'reader@agua.local', '+254700000002', 'meter_reader', NULL, crypt('Reader@123', gen_salt('bf'))),
  ('Alex Accountant', 'accountant@agua.local', '+254700000003', 'accountant', NULL, crypt('Accountant@123', gen_salt('bf'))),
  ('Jane Wanjiku', 'jane@agua.local', '+254711111111', 'customer', (SELECT id FROM customers WHERE acc_number = 'AG-0001'), crypt('Customer@123', gen_salt('bf')))
ON CONFLICT (email) DO NOTHING;

INSERT INTO billing_settings (
  id, due_rule, penalty_grace_days, penalty_type, penalty_value, deposit_required, default_deposit_amount
)
VALUES (1, 'next_month_end', 0, 'none', 0, FALSE, 0)
ON CONFLICT (id) DO UPDATE
SET due_rule = EXCLUDED.due_rule,
    penalty_grace_days = EXCLUDED.penalty_grace_days,
    penalty_type = EXCLUDED.penalty_type,
    penalty_value = EXCLUDED.penalty_value,
    deposit_required = EXCLUDED.deposit_required,
    default_deposit_amount = EXCLUDED.default_deposit_amount,
    updated_at = NOW();

INSERT INTO billing_periods (name, period_start, period_end, closing_date, bill_date, due_date, status, created_by)
VALUES (
  'May 2026',
  '2026-05-01',
  '2026-05-31',
  '2026-05-31',
  '2026-05-31',
  '2026-06-30',
  'open',
  (SELECT id FROM users WHERE email = 'admin@agua.local')
)
ON CONFLICT (period_start) DO UPDATE
SET name = EXCLUDED.name,
    period_end = EXCLUDED.period_end,
    closing_date = EXCLUDED.closing_date,
    bill_date = EXCLUDED.bill_date,
    due_date = EXCLUDED.due_date,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO meters (customer_id, meter_number, installed_at, initial_reading, status, notes)
VALUES
  ((SELECT id FROM customers WHERE acc_number = 'AG-0001'), 'AG-0001-MTR-1', '2026-04-01', 120, 'active', 'Seeded customer meter'),
  ((SELECT id FROM customers WHERE acc_number = 'AG-0002'), 'AG-0002-MTR-1', '2026-04-01', 500, 'active', 'Seeded customer meter'),
  ((SELECT id FROM customers WHERE acc_number = 'AG-0003'), 'AG-0003-MTR-1', '2026-04-01', 990, 'active', 'Seeded customer meter')
ON CONFLICT (meter_number) DO NOTHING;

INSERT INTO meter_readings (
  customer_id, meter_id, billing_period_id, reading_value, reading_date, created_by
)
VALUES
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0001'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0001-MTR-1'),
    NULL,
    120,
    '2026-04-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0001'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0001-MTR-1'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    148,
    '2026-05-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0002'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0002-MTR-1'),
    NULL,
    500,
    '2026-04-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0002'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0002-MTR-1'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    535,
    '2026-05-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0003'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0003-MTR-1'),
    NULL,
    990,
    '2026-04-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0003'),
    (SELECT id FROM meters WHERE meter_number = 'AG-0003-MTR-1'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    1048,
    '2026-05-01',
    (SELECT id FROM users WHERE email = 'reader@agua.local')
  );

WITH ordered AS (
  SELECT
    mr.id,
    LAG(mr.id) OVER (PARTITION BY mr.meter_id ORDER BY mr.reading_date ASC, mr.id ASC) AS previous_id,
    LAG(mr.reading_value) OVER (PARTITION BY mr.meter_id ORDER BY mr.reading_date ASC, mr.id ASC) AS previous_value
  FROM meter_readings mr
  WHERE mr.meter_id IS NOT NULL
)
UPDATE meter_readings mr
SET previous_reading_id = ordered.previous_id,
    previous_reading_value = ordered.previous_value
FROM ordered
WHERE mr.id = ordered.id;

INSERT INTO bills (
  customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month,
  previous_reading, current_reading, units_used, rate, amount, subtotal_amount, penalty_amount,
  deposit_applied_amount, adjustment_amount, total_amount, balance_amount, paid_amount, status, due_date,
  issued_at, paid_at
)
VALUES
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0001'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    'BILL-202605-AG-0001',
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0001') AND reading_date = '2026-04-01'),
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0001') AND reading_date = '2026-05-01'),
    '2026-05-01', 120, 148, 28, 75, 2100, 2100, 0, 0, 0, 2100, 1100, 1000, 'partial',
    '2026-06-30', NOW(), NULL
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0002'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    'BILL-202605-AG-0002',
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0002') AND reading_date = '2026-04-01'),
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0002') AND reading_date = '2026-05-01'),
    '2026-05-01', 500, 535, 35, 85, 2975, 2975, 0, 0, 0, 2975, 2975, 0, 'unpaid',
    '2026-06-30', NOW(), NULL
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0003'),
    (SELECT id FROM billing_periods WHERE period_start = '2026-05-01'),
    'BILL-202605-AG-0003',
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0003') AND reading_date = '2026-04-01'),
    (SELECT id FROM meter_readings WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0003') AND reading_date = '2026-05-01'),
    '2026-05-01', 990, 1048, 58, 70, 4060, 4060, 0, 0, 0, 4060, 0, 4060, 'paid',
    '2026-06-30', NOW(), NOW()
  );

INSERT INTO payments (
  customer_id, bill_id, amount, payment_date, method, reference, receipt_number,
  payment_channel, external_reference, received_from, total_allocated_amount, recorded_by
)
VALUES
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0001'),
    (SELECT id FROM bills WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0001') AND billing_month = '2026-05-01'),
    1000, '2026-05-08', 'mpesa_paybill', 'MPESA-DEMO-001', 'RCPT-000001',
    'mpesa_paybill', 'MPESA-DEMO-001', 'Jane Wanjiku', 1000, (SELECT id FROM users WHERE email = 'accountant@agua.local')
  ),
  (
    (SELECT id FROM customers WHERE acc_number = 'AG-0003'),
    (SELECT id FROM bills WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0003') AND billing_month = '2026-05-01'),
    4060, '2026-05-09', 'bank', 'BANK-DEMO-003', 'RCPT-000002',
    'bank', 'BANK-DEMO-003', 'Green Valley School', 4060, (SELECT id FROM users WHERE email = 'accountant@agua.local')
  );

INSERT INTO payment_allocations (payment_id, bill_id, amount)
VALUES
  (
    (SELECT id FROM payments WHERE receipt_number = 'RCPT-000001'),
    (SELECT id FROM bills WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0001') AND billing_month = '2026-05-01'),
    1000
  ),
  (
    (SELECT id FROM payments WHERE receipt_number = 'RCPT-000002'),
    (SELECT id FROM bills WHERE customer_id = (SELECT id FROM customers WHERE acc_number = 'AG-0003') AND billing_month = '2026-05-01'),
    4060
  )
ON CONFLICT (payment_id, bill_id) DO UPDATE
SET amount = EXCLUDED.amount;
