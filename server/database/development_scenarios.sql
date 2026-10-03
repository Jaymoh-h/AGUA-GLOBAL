-- Idempotent, non-production data for demonstrating operational workflows.
DO $$
DECLARE
  v_admin_id INTEGER;
  v_reader_id INTEGER;
  v_accountant_id INTEGER;
  v_domestic_rate_id INTEGER;
  v_commercial_rate_id INTEGER;
  v_institutional_rate_id INTEGER;
  v_zone_a_id INTEGER;
  v_zone_b_id INTEGER;
  v_zone_c_id INTEGER;
  v_period_id INTEGER;
  v_period_start DATE := date_trunc('month', CURRENT_DATE)::date;
  v_period_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date;
  v_reading_date DATE := GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 1);
  v_month_key TEXT := to_char(CURRENT_DATE, 'YYYYMM');
  v_overdue_customer_id INTEGER;
  v_partial_customer_id INTEGER;
  v_missing_customer_id INTEGER;
  v_held_customer_id INTEGER;
  v_source_customer_id INTEGER;
  v_paid_customer_id INTEGER;
  v_credit_customer_id INTEGER;
  v_overdue_meter_id INTEGER;
  v_partial_meter_id INTEGER;
  v_missing_meter_id INTEGER;
  v_held_meter_id INTEGER;
  v_source_meter_id INTEGER;
  v_paid_meter_id INTEGER;
  v_overdue_previous_reading_id INTEGER;
  v_overdue_current_reading_id INTEGER;
  v_partial_previous_reading_id INTEGER;
  v_partial_current_reading_id INTEGER;
  v_held_previous_reading_id INTEGER;
  v_held_current_reading_id INTEGER;
  v_source_previous_reading_id INTEGER;
  v_source_current_reading_id INTEGER;
  v_paid_previous_reading_id INTEGER;
  v_paid_current_reading_id INTEGER;
  v_overdue_bill_id INTEGER;
  v_partial_bill_id INTEGER;
  v_held_bill_id INTEGER;
  v_paid_bill_id INTEGER;
  v_urgent_request_id INTEGER;
  v_connection_request_id INTEGER;
  v_plan_request_id INTEGER;
  v_contractor_id INTEGER;
  v_payee_id INTEGER;
  v_subscription_payee_id INTEGER;
  v_payroll_run_id INTEGER;
  v_production_meter_id INTEGER;
  v_week_id INTEGER;
BEGIN
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_reader_id FROM users WHERE role = 'meter_reader' AND is_active = TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_accountant_id FROM users WHERE role = 'accountant' AND is_active = TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_domestic_rate_id FROM rates WHERE is_active = TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_commercial_rate_id FROM rates WHERE is_active = TRUE ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_institutional_rate_id FROM rates WHERE is_active = TRUE ORDER BY id OFFSET 2 LIMIT 1;
  v_commercial_rate_id := COALESCE(v_commercial_rate_id, v_domestic_rate_id);
  v_institutional_rate_id := COALESCE(v_institutional_rate_id, v_domestic_rate_id);
  SELECT id INTO v_zone_a_id FROM zones WHERE is_active = TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_zone_b_id FROM zones WHERE is_active = TRUE ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_zone_c_id FROM zones WHERE is_active = TRUE ORDER BY id OFFSET 2 LIMIT 1;
  v_zone_b_id := COALESCE(v_zone_b_id, v_zone_a_id);
  v_zone_c_id := COALESCE(v_zone_c_id, v_zone_a_id);

  IF v_admin_id IS NULL OR v_reader_id IS NULL OR v_accountant_id IS NULL OR v_domestic_rate_id IS NULL OR v_zone_a_id IS NULL THEN
    RAISE EXCEPTION 'Development scenarios need active admin, meter-reader, accountant, rate, and zone records.';
  END IF;

  INSERT INTO billing_periods (name, period_start, period_end, closing_date, bill_date, due_date, status, created_by)
  VALUES (
    'Development ' || to_char(v_period_start, 'FMMonth YYYY'),
    v_period_start,
    v_period_end,
    v_period_end,
    v_period_end,
    v_period_end + 14,
    'open',
    v_admin_id
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_period_id FROM billing_periods WHERE period_start = v_period_start;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No current billing period is available for development scenarios.';
  END IF;

  INSERT INTO customers (name, phone, email, location, acc_number, rate, rate_id, zone_id, status, preferred_delivery_channel, email_delivery_enabled, sms_delivery_enabled, whatsapp_delivery_enabled)
  VALUES
    ('Dev Overdue Apartments', '+254700100001', 'dev-overdue@agua.local', 'Mara Lane, Block A', 'DEV-OVERDUE-001', 75, v_domestic_rate_id, v_zone_a_id, 'active', 'email', TRUE, TRUE, FALSE),
    ('Dev Partial Traders', '+254700100002', 'dev-partial@agua.local', 'Market Road, Stall 14', 'DEV-PARTIAL-002', 85, v_commercial_rate_id, v_zone_b_id, 'active', 'sms', TRUE, TRUE, TRUE),
    ('Dev Missing Reading Clinic', '+254700100003', 'dev-missing@agua.local', 'Hill View Clinic Road', 'DEV-MISSING-003', 70, v_institutional_rate_id, v_zone_c_id, 'active', 'email', TRUE, FALSE, FALSE),
    ('Dev Held Bill Workshop', '+254700100004', 'dev-held@agua.local', 'Main Street Workshop Row', 'DEV-HELD-004', 85, v_commercial_rate_id, v_zone_b_id, 'active', 'email', TRUE, FALSE, FALSE),
    ('Dev Source Review Flats', '+254700100005', 'dev-source@agua.local', 'Market Road Apartments', 'DEV-SOURCE-005', 75, v_domestic_rate_id, v_zone_a_id, 'active', 'email', TRUE, TRUE, FALSE),
    ('Dev Paid School', '+254700100006', 'dev-paid@agua.local', 'Hill View Primary', 'DEV-PAID-006', 70, v_institutional_rate_id, v_zone_c_id, 'active', 'email', TRUE, TRUE, TRUE),
    ('Dev Credit Account', '+254700100007', NULL, 'Hill View Extension', 'DEV-CREDIT-007', 75, v_domestic_rate_id, v_zone_c_id, 'active', 'email', FALSE, FALSE, FALSE)
  ON CONFLICT (acc_number) DO UPDATE
  SET name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      location = EXCLUDED.location,
      rate = EXCLUDED.rate,
      rate_id = EXCLUDED.rate_id,
      zone_id = EXCLUDED.zone_id,
      status = EXCLUDED.status,
      preferred_delivery_channel = EXCLUDED.preferred_delivery_channel,
      email_delivery_enabled = EXCLUDED.email_delivery_enabled,
      sms_delivery_enabled = EXCLUDED.sms_delivery_enabled,
      whatsapp_delivery_enabled = EXCLUDED.whatsapp_delivery_enabled,
      updated_at = NOW();

  SELECT id INTO v_overdue_customer_id FROM customers WHERE acc_number = 'DEV-OVERDUE-001';
  SELECT id INTO v_partial_customer_id FROM customers WHERE acc_number = 'DEV-PARTIAL-002';
  SELECT id INTO v_missing_customer_id FROM customers WHERE acc_number = 'DEV-MISSING-003';
  SELECT id INTO v_held_customer_id FROM customers WHERE acc_number = 'DEV-HELD-004';
  SELECT id INTO v_source_customer_id FROM customers WHERE acc_number = 'DEV-SOURCE-005';
  SELECT id INTO v_paid_customer_id FROM customers WHERE acc_number = 'DEV-PAID-006';
  SELECT id INTO v_credit_customer_id FROM customers WHERE acc_number = 'DEV-CREDIT-007';

  INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status, notes)
  VALUES
    (v_overdue_customer_id, 'DEV-MTR-OVERDUE-001', 'client_billing', v_period_start - 120, 1000, 'active', 'Development overdue-balance scenario'),
    (v_partial_customer_id, 'DEV-MTR-PARTIAL-002', 'client_billing', v_period_start - 120, 2200, 'active', 'Development partial-payment scenario'),
    (v_missing_customer_id, 'DEV-MTR-MISSING-003', 'client_billing', v_period_start - 120, 3400, 'active', 'Development missing-reading blocker'),
    (v_held_customer_id, 'DEV-MTR-HELD-004', 'client_billing', v_period_start - 120, 4600, 'active', 'Development held-bill blocker'),
    (v_source_customer_id, 'DEV-MTR-SOURCE-005', 'source_backup', v_period_start - 120, 5800, 'active', 'Development source-billing review'),
    (v_paid_customer_id, 'DEV-MTR-PAID-006', 'client_billing', v_period_start - 120, 7000, 'active', 'Development fully-paid scenario')
  ON CONFLICT (meter_number) DO UPDATE
  SET customer_id = EXCLUDED.customer_id,
      meter_role = EXCLUDED.meter_role,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = NOW();

  SELECT id INTO v_overdue_meter_id FROM meters WHERE meter_number = 'DEV-MTR-OVERDUE-001';
  SELECT id INTO v_partial_meter_id FROM meters WHERE meter_number = 'DEV-MTR-PARTIAL-002';
  SELECT id INTO v_missing_meter_id FROM meters WHERE meter_number = 'DEV-MTR-MISSING-003';
  SELECT id INTO v_held_meter_id FROM meters WHERE meter_number = 'DEV-MTR-HELD-004';
  SELECT id INTO v_source_meter_id FROM meters WHERE meter_number = 'DEV-MTR-SOURCE-005';
  SELECT id INTO v_paid_meter_id FROM meters WHERE meter_number = 'DEV-MTR-PAID-006';

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_overdue_customer_id, v_overdue_meter_id, 1000, v_period_start - 1, 'field', 'Development baseline', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_overdue_previous_reading_id;
  INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_overdue_customer_id, v_overdue_meter_id, v_period_id, 1042, v_reading_date, 'field', 'Development current reading', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET billing_period_id = EXCLUDED.billing_period_id, reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_overdue_current_reading_id;

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_partial_customer_id, v_partial_meter_id, 2200, v_period_start - 1, 'field', 'Development baseline', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_partial_previous_reading_id;
  INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_partial_customer_id, v_partial_meter_id, v_period_id, 2260, v_reading_date, 'field', 'Development current reading', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET billing_period_id = EXCLUDED.billing_period_id, reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_partial_current_reading_id;

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_missing_customer_id, v_missing_meter_id, 3400, v_period_start - 1, 'field', 'Development baseline; current reading deliberately missing', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes;

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_held_customer_id, v_held_meter_id, 4600, v_period_start - 1, 'field', 'Development baseline', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_held_previous_reading_id;
  INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_held_customer_id, v_held_meter_id, v_period_id, 4642, v_reading_date, 'field', 'Development held-bill reading', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET billing_period_id = EXCLUDED.billing_period_id, reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_held_current_reading_id;

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_source_customer_id, v_source_meter_id, 5800, v_period_start - 1, 'field', 'Development source baseline', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_source_previous_reading_id;
  INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_source_customer_id, v_source_meter_id, v_period_id, 5855, v_reading_date, 'field', 'Development source review reading', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET billing_period_id = EXCLUDED.billing_period_id, reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_source_current_reading_id;

  INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_paid_customer_id, v_paid_meter_id, 7000, v_period_start - 1, 'field', 'Development baseline', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_paid_previous_reading_id;
  INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes, created_by)
  VALUES (v_paid_customer_id, v_paid_meter_id, v_period_id, 7048, v_reading_date, 'field', 'Development fully-paid reading', v_reader_id)
  ON CONFLICT (meter_id, reading_date) DO UPDATE SET billing_period_id = EXCLUDED.billing_period_id, reading_value = EXCLUDED.reading_value, notes = EXCLUDED.notes
  RETURNING id INTO v_paid_current_reading_id;

  UPDATE meter_readings
  SET previous_reading_id = CASE meter_id
        WHEN v_overdue_meter_id THEN v_overdue_previous_reading_id
        WHEN v_partial_meter_id THEN v_partial_previous_reading_id
        WHEN v_held_meter_id THEN v_held_previous_reading_id
        WHEN v_source_meter_id THEN v_source_previous_reading_id
        WHEN v_paid_meter_id THEN v_paid_previous_reading_id
      END,
      previous_reading_value = CASE meter_id
        WHEN v_overdue_meter_id THEN 1000
        WHEN v_partial_meter_id THEN 2200
        WHEN v_held_meter_id THEN 4600
        WHEN v_source_meter_id THEN 5800
        WHEN v_paid_meter_id THEN 7000
      END,
      updated_at = NOW()
  WHERE id IN (v_overdue_current_reading_id, v_partial_current_reading_id, v_held_current_reading_id, v_source_current_reading_id, v_paid_current_reading_id);

  INSERT INTO bills (customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month, previous_reading, current_reading, units_used, rate, amount, subtotal_amount, total_amount, balance_amount, paid_amount, status, due_date, issued_at, billing_meter_id, billing_meter_role, billing_source, bill_pay_status, bill_origin)
  VALUES (v_overdue_customer_id, v_period_id, 'DEV-BILL-OVERDUE-' || v_month_key, v_overdue_previous_reading_id, v_overdue_current_reading_id, v_period_start, 1000, 1042, 42, 75, 3150, 3150, 3150, 3150, 0, 'unpaid', CURRENT_DATE - 18, NOW(), v_overdue_meter_id, 'client_billing', 'client_meter', 'payable', 'meter_reading')
  ON CONFLICT (bill_number) DO UPDATE SET balance_amount = EXCLUDED.balance_amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, due_date = EXCLUDED.due_date, bill_pay_status = EXCLUDED.bill_pay_status
  RETURNING id INTO v_overdue_bill_id;

  INSERT INTO bills (customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month, previous_reading, current_reading, units_used, rate, amount, subtotal_amount, total_amount, balance_amount, paid_amount, status, due_date, issued_at, billing_meter_id, billing_meter_role, billing_source, bill_pay_status, bill_origin)
  VALUES (v_partial_customer_id, v_period_id, 'DEV-BILL-PARTIAL-' || v_month_key, v_partial_previous_reading_id, v_partial_current_reading_id, v_period_start, 2200, 2260, 60, 85, 5100, 5100, 5100, 3100, 2000, 'partial', CURRENT_DATE - 8, NOW(), v_partial_meter_id, 'client_billing', 'client_meter', 'payable', 'meter_reading')
  ON CONFLICT (bill_number) DO UPDATE SET balance_amount = EXCLUDED.balance_amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, due_date = EXCLUDED.due_date, bill_pay_status = EXCLUDED.bill_pay_status
  RETURNING id INTO v_partial_bill_id;

  INSERT INTO bills (customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month, previous_reading, current_reading, units_used, rate, amount, subtotal_amount, total_amount, balance_amount, paid_amount, status, due_date, issued_at, billing_meter_id, billing_meter_role, billing_source, bill_pay_status, payability_reason, bill_origin)
  VALUES (v_held_customer_id, v_period_id, 'DEV-BILL-HELD-' || v_month_key, v_held_previous_reading_id, v_held_current_reading_id, v_period_start, 4600, 4642, 42, 85, 3570, 3570, 3570, 3570, 0, 'unpaid', CURRENT_DATE + 14, NOW(), v_held_meter_id, 'client_billing', 'client_meter', 'held', 'Development scenario: awaiting billing review', 'meter_reading')
  ON CONFLICT (bill_number) DO UPDATE SET balance_amount = EXCLUDED.balance_amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, bill_pay_status = EXCLUDED.bill_pay_status, payability_reason = EXCLUDED.payability_reason
  RETURNING id INTO v_held_bill_id;

  INSERT INTO bills (customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month, previous_reading, current_reading, units_used, rate, amount, subtotal_amount, total_amount, balance_amount, paid_amount, status, due_date, issued_at, paid_at, billing_meter_id, billing_meter_role, billing_source, bill_pay_status, bill_origin)
  VALUES (v_paid_customer_id, v_period_id, 'DEV-BILL-PAID-' || v_month_key, v_paid_previous_reading_id, v_paid_current_reading_id, v_period_start, 7000, 7048, 48, 70, 3360, 3360, 3360, 0, 3360, 'paid', CURRENT_DATE - 4, NOW(), NOW(), v_paid_meter_id, 'client_billing', 'client_meter', 'payable', 'meter_reading')
  ON CONFLICT (bill_number) DO UPDATE SET balance_amount = EXCLUDED.balance_amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, bill_pay_status = EXCLUDED.bill_pay_status, paid_at = EXCLUDED.paid_at
  RETURNING id INTO v_paid_bill_id;

  INSERT INTO payments (customer_id, bill_id, amount, payment_date, method, reference, receipt_number, payment_channel, external_reference, received_from, status, total_allocated_amount, unallocated_amount, recorded_by)
  VALUES (v_partial_customer_id, v_partial_bill_id, 2000, CURRENT_DATE - 4, 'mpesa_paybill', 'DEV-MPESA-PARTIAL-' || v_month_key, 'DEV-RCPT-PARTIAL-' || v_month_key, 'mpesa_paybill', 'DEV-MPESA-PARTIAL-' || v_month_key, 'Dev Partial Traders', 'posted', 2000, 0, v_accountant_id)
  ON CONFLICT (receipt_number) DO UPDATE SET bill_id = EXCLUDED.bill_id, amount = EXCLUDED.amount, total_allocated_amount = EXCLUDED.total_allocated_amount, unallocated_amount = EXCLUDED.unallocated_amount, status = EXCLUDED.status;
  INSERT INTO payment_allocations (payment_id, bill_id, amount)
  VALUES ((SELECT id FROM payments WHERE receipt_number = 'DEV-RCPT-PARTIAL-' || v_month_key), v_partial_bill_id, 2000)
  ON CONFLICT (payment_id, bill_id) DO UPDATE SET amount = EXCLUDED.amount;

  INSERT INTO payments (customer_id, bill_id, amount, payment_date, method, reference, receipt_number, payment_channel, external_reference, received_from, status, total_allocated_amount, unallocated_amount, recorded_by)
  VALUES (v_paid_customer_id, v_paid_bill_id, 3360, CURRENT_DATE - 2, 'bank', 'DEV-BANK-PAID-' || v_month_key, 'DEV-RCPT-PAID-' || v_month_key, 'bank', 'DEV-BANK-PAID-' || v_month_key, 'Dev Paid School', 'posted', 3360, 0, v_accountant_id)
  ON CONFLICT (receipt_number) DO UPDATE SET bill_id = EXCLUDED.bill_id, amount = EXCLUDED.amount, total_allocated_amount = EXCLUDED.total_allocated_amount, unallocated_amount = EXCLUDED.unallocated_amount, status = EXCLUDED.status;
  INSERT INTO payment_allocations (payment_id, bill_id, amount)
  VALUES ((SELECT id FROM payments WHERE receipt_number = 'DEV-RCPT-PAID-' || v_month_key), v_paid_bill_id, 3360)
  ON CONFLICT (payment_id, bill_id) DO UPDATE SET amount = EXCLUDED.amount;

  INSERT INTO payments (customer_id, amount, payment_date, method, reference, receipt_number, payment_channel, received_from, status, total_allocated_amount, unallocated_amount, notes, recorded_by)
  VALUES (v_credit_customer_id, 800, CURRENT_DATE - 1, 'cash', 'DEV-CREDIT-' || v_month_key, 'DEV-RCPT-CREDIT-' || v_month_key, 'cash', 'Dev Credit Account', 'posted', 0, 800, 'Development unallocated-credit scenario', v_accountant_id)
  ON CONFLICT (receipt_number) DO UPDATE SET amount = EXCLUDED.amount, total_allocated_amount = 0, unallocated_amount = EXCLUDED.unallocated_amount, status = EXCLUDED.status;

  INSERT INTO payments (customer_id, amount, payment_date, method, reference, receipt_number, payment_channel, external_reference, received_from, status, total_allocated_amount, unallocated_amount, notes, recorded_by)
  VALUES (v_overdue_customer_id, 1250, CURRENT_DATE - 5, 'cash', 'DEV-SUSPENSE-' || v_month_key, 'DEV-RCPT-SUSPENSE-' || v_month_key, 'cash', 'DEV-SUSPENSE-' || v_month_key, 'Dev Overdue Apartments', 'voided_to_suspense', 0, 0, 'Development payment suspense scenario', v_accountant_id)
  ON CONFLICT (receipt_number) DO UPDATE SET status = EXCLUDED.status, total_allocated_amount = 0, unallocated_amount = 0, notes = EXCLUDED.notes;
  IF NOT EXISTS (SELECT 1 FROM payment_suspense_items WHERE source_payment_id = (SELECT id FROM payments WHERE receipt_number = 'DEV-RCPT-SUSPENSE-' || v_month_key)) THEN
    INSERT INTO payment_suspense_items (source_payment_id, customer_id, amount, receipt_number, payment_channel, external_reference, received_from, payment_date, reason, status, created_by)
    VALUES ((SELECT id FROM payments WHERE receipt_number = 'DEV-RCPT-SUSPENSE-' || v_month_key), v_overdue_customer_id, 1250, 'DEV-RCPT-SUSPENSE-' || v_month_key, 'cash', 'DEV-SUSPENSE-' || v_month_key, 'Dev Overdue Apartments', CURRENT_DATE - 5, 'Development scenario: disputed cash receipt', 'held', v_accountant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM customer_adjustments WHERE customer_id = v_partial_customer_id AND reason = 'Development scenario: tariff review pending') THEN
    INSERT INTO customer_adjustments (customer_id, adjustment_type, amount, adjustment_date, reason, status, requested_by)
    VALUES (v_partial_customer_id, 'credit', 350, CURRENT_DATE - 2, 'Development scenario: tariff review pending', 'pending', v_accountant_id);
  END IF;

  INSERT INTO source_billing_requests (customer_id, meter_id, billing_period_id, previous_reading_id, current_reading_id, previous_reading, current_reading, units_used, rate, amount, subtotal_amount, due_date, reason, status, requested_by)
  VALUES (v_source_customer_id, v_source_meter_id, v_period_id, v_source_previous_reading_id, v_source_current_reading_id, 5800, 5855, 55, 75, 4125, 4125, CURRENT_DATE + 14, 'Development scenario: source meter billing awaiting review', 'pending', v_reader_id)
  ON CONFLICT (current_reading_id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, amount = EXCLUDED.amount, subtotal_amount = EXCLUDED.subtotal_amount;

  INSERT INTO maintenance_requests (request_number, customer_id, zone_id, meter_id, title, category, priority, status, source, reported_at, target_date, assigned_to, description, request_metadata, created_by)
  VALUES
    ('DEV-MR-URGENT-' || v_month_key, v_held_customer_id, v_zone_b_id, v_held_meter_id, 'Urgent pressure investigation - development scenario', 'low_pressure', 'urgent', 'in_progress', 'field', NOW() - INTERVAL '2 days', CURRENT_DATE - 1, v_reader_id, 'Pressure complaint with a deliberately overdue target for field queue testing.', '{}'::jsonb, v_reader_id),
    ('DEV-MR-FIELD-REVIEW-' || v_month_key, v_paid_customer_id, v_zone_c_id, v_paid_meter_id, 'Field review and no-cost completion - development scenario', 'meter_fault', 'normal', 'open', 'field', NOW() - INTERVAL '1 day', CURRENT_DATE, v_reader_id, 'Use this scheduled no-cost visit to test field review, local resolution-note retention, and explicit no-expense completion.', '{}'::jsonb, v_reader_id),
    ('DEV-MR-CONNECTION-' || v_month_key, v_overdue_customer_id, v_zone_a_id, NULL, 'Connection inspection - development scenario', 'connection', 'normal', 'open', 'customer_portal', NOW() - INTERVAL '1 day', CURRENT_DATE + 5, v_reader_id, 'Structured connection-inspection scenario for field planning.', jsonb_build_object('connection_request', jsonb_build_object('request_type', 'service_extension', 'site_location', 'Mara Lane rear service point', 'landmark', 'Blue gate opposite the clinic', 'access_contact_name', 'Dev Site Contact', 'access_contact_phone', '+254700100001', 'preferred_inspection_date', (CURRENT_DATE + 3)::text, 'access_notes', 'Call before arrival; access is available after 10:00.')), v_admin_id),
    ('DEV-MR-PLAN-' || v_month_key, v_partial_customer_id, v_zone_b_id, NULL, 'Payment plan proposal - development scenario', 'payment_plan', 'normal', 'open', 'customer_portal', NOW() - INTERVAL '1 day', NULL, NULL, 'Customer proposal retained for Collections review.', jsonb_build_object('payment_plan_proposal', jsonb_build_object('installment_amount', 1000, 'frequency', 'monthly', 'preferred_first_due_date', (CURRENT_DATE + 7)::text)), v_admin_id),
    ('DEV-MR-DISPUTE-' || v_month_key, v_overdue_customer_id, v_zone_a_id, v_overdue_meter_id, 'Billing dispute - development scenario', 'billing_dispute', 'high', 'open', 'customer_portal', NOW() - INTERVAL '1 day', NULL, NULL, 'Customer requested a review of the development overdue bill.', jsonb_build_object('billing_dispute', jsonb_build_object('bill_id', v_overdue_bill_id, 'bill_number', 'DEV-BILL-OVERDUE-' || v_month_key, 'billing_month', v_period_start::text, 'total_amount', 3150, 'balance_amount', 3150, 'reason', 'meter_reading')), v_admin_id)
  ON CONFLICT (request_number) DO UPDATE
  SET status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      target_date = EXCLUDED.target_date,
      assigned_to = EXCLUDED.assigned_to,
      description = EXCLUDED.description,
      request_metadata = EXCLUDED.request_metadata,
      updated_at = NOW();

  SELECT id INTO v_urgent_request_id FROM maintenance_requests WHERE request_number = 'DEV-MR-URGENT-' || v_month_key;
  SELECT id INTO v_connection_request_id FROM maintenance_requests WHERE request_number = 'DEV-MR-CONNECTION-' || v_month_key;
  SELECT id INTO v_plan_request_id FROM maintenance_requests WHERE request_number = 'DEV-MR-PLAN-' || v_month_key;

  INSERT INTO expenses (expense_date, category, vendor, description, amount, payment_channel, reference, maintenance_request_id, notes, recorded_by)
  SELECT CURRENT_DATE - 3, 'Network repair', 'Dev Field Supplies', 'Development repair cost linked to the urgent maintenance scenario.', 2850, 'mpesa_paybill', 'DEV-EXP-URGENT-' || v_month_key, v_urgent_request_id, 'Use for expense-linked field-work testing.', v_accountant_id
  WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE reference = 'DEV-EXP-URGENT-' || v_month_key);
  INSERT INTO expenses (expense_date, category, vendor, description, amount, payment_channel, reference, notes, recorded_by)
  SELECT CURRENT_DATE - 6, 'Treatment chemicals', 'Dev Water Chemicals', 'Development operating-cost scenario.', 7600, 'bank', 'DEV-EXP-CHEM-' || v_month_key, 'Use for margin and budget testing.', v_accountant_id
  WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE reference = 'DEV-EXP-CHEM-' || v_month_key);

  INSERT INTO payment_arrangements (arrangement_number, customer_id, maintenance_request_id, agreed_amount, installment_amount, frequency, first_due_date, status, notes, created_by, approved_by, approved_at)
  VALUES ('DEV-PLAN-' || v_month_key, v_partial_customer_id, v_plan_request_id, 3100, 1000, 'monthly', CURRENT_DATE - 35, 'active', 'Development plan deliberately behind for follow-up testing.', v_accountant_id, v_accountant_id, NOW() - INTERVAL '35 days')
  ON CONFLICT (arrangement_number) DO UPDATE SET status = EXCLUDED.status, installment_amount = EXCLUDED.installment_amount, first_due_date = EXCLUDED.first_due_date, notes = EXCLUDED.notes;

  IF NOT EXISTS (SELECT 1 FROM standing_orders WHERE mandate_reference = 'DEV-MANDATE-' || v_month_key) THEN
    INSERT INTO standing_orders (customer_id, mandate_reference, expected_amount, frequency, first_due_date, status, notes, created_by, updated_by)
    VALUES (v_overdue_customer_id, 'DEV-MANDATE-' || v_month_key, 900, 'monthly', CURRENT_DATE - 32, 'active', 'Development standing order deliberately behind.', v_accountant_id, v_accountant_id);
  END IF;

  INSERT INTO contractors (name, phone, email, tax_pin, payment_terms_days, status, notes, created_by)
  VALUES ('Dev Borehole Services', '+254700200001', 'dev-contractors@agua.local', 'DEV-PIN-001', 14, 'active', 'Development contractor scenarios.', v_admin_id)
  ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, email = EXCLUDED.email, payment_terms_days = EXCLUDED.payment_terms_days, status = EXCLUDED.status, notes = EXCLUDED.notes
  RETURNING id INTO v_contractor_id;
  INSERT INTO contractor_invoices (contractor_id, invoice_number, invoice_date, due_date, description, category, subtotal_amount, vat_amount, total_amount, status, notes, created_by, reviewed_by, reviewed_at)
  VALUES
    (v_contractor_id, 'DEV-CONTRACT-APPROVED-' || v_month_key, CURRENT_DATE - 16, CURRENT_DATE - 2, 'Pump maintenance and inspection.', 'Borehole maintenance', 12000, 1920, 13920, 'approved', 'Development approved supplier payable.', v_admin_id, v_accountant_id, NOW() - INTERVAL '3 days'),
    (v_contractor_id, 'DEV-CONTRACT-DRAFT-' || v_month_key, CURRENT_DATE - 2, CURRENT_DATE + 12, 'Pipeline survey proposal.', 'Network survey', 4500, 720, 5220, 'draft', 'Development draft contractor invoice.', v_admin_id, NULL, NULL)
  ON CONFLICT (contractor_id, invoice_number) DO UPDATE SET due_date = EXCLUDED.due_date, status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, notes = EXCLUDED.notes;

  INSERT INTO payroll_payees (payee_type, name, code, title, rate_amount, rate_basis, default_additions, default_deductions, payment_channel, status, recurrence_type, start_date, metadata, created_by)
  VALUES
    ('employee', 'Dev Operations Lead', 'DEV-PAY-OPS', 'Operations Lead', 42000, 'monthly', 1500, 2200, 'bank', 'active', 'recurring', v_period_start - 180, '{"department":"Operations"}'::jsonb, v_admin_id),
    ('subscription', 'Dev Telemetry Subscription', 'DEV-PAY-TELEMETRY', 'Telemetry platform', 6800, 'subscription', 0, 0, 'bank', 'active', 'recurring', v_period_start - 180, '{"department":"Operations technology"}'::jsonb, v_admin_id)
  ON CONFLICT (code) DO UPDATE SET rate_amount = EXCLUDED.rate_amount, default_additions = EXCLUDED.default_additions, default_deductions = EXCLUDED.default_deductions, status = EXCLUDED.status, recurrence_type = EXCLUDED.recurrence_type, metadata = EXCLUDED.metadata, updated_at = NOW();
  SELECT id INTO v_payee_id FROM payroll_payees WHERE code = 'DEV-PAY-OPS';
  SELECT id INTO v_subscription_payee_id FROM payroll_payees WHERE code = 'DEV-PAY-TELEMETRY';

  SELECT id INTO v_payroll_run_id FROM payroll_runs WHERE name = 'DEV Payroll - ' || to_char(v_period_start, 'FMMonth YYYY') AND period_start = v_period_start LIMIT 1;
  IF v_payroll_run_id IS NULL THEN
    INSERT INTO payroll_runs (name, period_start, period_end, status, notes, created_by)
    VALUES ('DEV Payroll - ' || to_char(v_period_start, 'FMMonth YYYY'), v_period_start, v_period_end, 'pending_approval', 'Development payroll approval scenario.', v_admin_id)
    RETURNING id INTO v_payroll_run_id;
  END IF;
  INSERT INTO payroll_line_items (payroll_run_id, payee_id, payee_type, source_units, gross_amount, additions, deductions, net_amount, status, notes, metadata, source_type, created_by)
  VALUES
    (v_payroll_run_id, v_payee_id, 'employee', 1, 42000, 1500, 2200, 41300, 'pending_approval', 'Development employee payroll line.', '{"department":"Operations"}'::jsonb, 'auto_recurring', v_admin_id),
    (v_payroll_run_id, v_subscription_payee_id, 'subscription', 1, 6800, 0, 0, 6800, 'pending_approval', 'Development subscription payroll line.', '{"department":"Operations technology"}'::jsonb, 'auto_recurring', v_admin_id)
  ON CONFLICT (payroll_run_id, payee_id) DO UPDATE SET gross_amount = EXCLUDED.gross_amount, additions = EXCLUDED.additions, deductions = EXCLUDED.deductions, net_amount = EXCLUDED.net_amount, status = EXCLUDED.status, notes = EXCLUDED.notes;
  UPDATE payroll_runs
  SET status = 'pending_approval',
      total_gross = (SELECT COALESCE(SUM(gross_amount + additions), 0) FROM payroll_line_items WHERE payroll_run_id = v_payroll_run_id),
      total_deductions = (SELECT COALESCE(SUM(deductions), 0) FROM payroll_line_items WHERE payroll_run_id = v_payroll_run_id),
      total_net = (SELECT COALESCE(SUM(net_amount), 0) FROM payroll_line_items WHERE payroll_run_id = v_payroll_run_id),
      updated_at = NOW()
  WHERE id = v_payroll_run_id;

  INSERT INTO production_source_meters (zone_id, rate_id, meter_number, name, meter_type, installed_at, initial_reading, status, notes, created_by)
  VALUES (v_zone_a_id, v_domestic_rate_id, 'DEV-PRD-SOURCE-A', 'Development shared source A', 'shared_source', v_period_start - 365, 12000, 'active', 'Development production/top-up scenario.', v_admin_id)
  ON CONFLICT (meter_number) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
  RETURNING id INTO v_production_meter_id;
  IF NOT EXISTS (SELECT 1 FROM production_electricity_topups WHERE reference = 'DEV-TOPUP-' || v_month_key) THEN
    INSERT INTO production_electricity_topups (topup_date, kwh_units, total_cost, cost_per_unit, reference, notes, created_by)
    VALUES (CURRENT_DATE - 8, 480, 9600, 20, 'DEV-TOPUP-' || v_month_key, 'Development electricity top-up.', v_admin_id);
  END IF;

  INSERT INTO production_weekly_readings (reading_date, prepaid_kwh_balance, notes, created_by)
  VALUES
    (CURRENT_DATE - 21, 780, 'Development weekly production baseline.', v_reader_id),
    (CURRENT_DATE - 14, 620, 'Development weekly production reading.', v_reader_id),
    (CURRENT_DATE - 7, 460, 'Development weekly production reading.', v_reader_id),
    (v_reading_date, 310, 'Development current production reading.', v_reader_id)
  ON CONFLICT (reading_date) DO UPDATE SET prepaid_kwh_balance = EXCLUDED.prepaid_kwh_balance, notes = EXCLUDED.notes, updated_at = NOW();

  SELECT id INTO v_week_id FROM production_weekly_readings WHERE reading_date = CURRENT_DATE - 21;
  INSERT INTO production_meter_readings (weekly_reading_id, production_meter_id, reading_value, previous_reading_value, consumption, tariff_snapshot, revenue_amount, notes)
  VALUES (v_week_id, v_production_meter_id, 12120, 12000, 120, '{"source":"development"}'::jsonb, 9000, 'Development weekly source output.')
  ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE SET reading_value = EXCLUDED.reading_value, previous_reading_value = EXCLUDED.previous_reading_value, consumption = EXCLUDED.consumption, revenue_amount = EXCLUDED.revenue_amount;
  SELECT id INTO v_week_id FROM production_weekly_readings WHERE reading_date = CURRENT_DATE - 14;
  INSERT INTO production_meter_readings (weekly_reading_id, production_meter_id, reading_value, previous_reading_value, consumption, tariff_snapshot, revenue_amount, notes)
  VALUES (v_week_id, v_production_meter_id, 12255, 12120, 135, '{"source":"development"}'::jsonb, 10125, 'Development weekly source output.')
  ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE SET reading_value = EXCLUDED.reading_value, previous_reading_value = EXCLUDED.previous_reading_value, consumption = EXCLUDED.consumption, revenue_amount = EXCLUDED.revenue_amount;
  SELECT id INTO v_week_id FROM production_weekly_readings WHERE reading_date = CURRENT_DATE - 7;
  INSERT INTO production_meter_readings (weekly_reading_id, production_meter_id, reading_value, previous_reading_value, consumption, tariff_snapshot, revenue_amount, notes)
  VALUES (v_week_id, v_production_meter_id, 12365, 12255, 110, '{"source":"development"}'::jsonb, 8250, 'Development weekly source output.')
  ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE SET reading_value = EXCLUDED.reading_value, previous_reading_value = EXCLUDED.previous_reading_value, consumption = EXCLUDED.consumption, revenue_amount = EXCLUDED.revenue_amount;
  SELECT id INTO v_week_id FROM production_weekly_readings WHERE reading_date = v_reading_date;
  INSERT INTO production_meter_readings (weekly_reading_id, production_meter_id, reading_value, previous_reading_value, consumption, tariff_snapshot, revenue_amount, notes)
  VALUES (v_week_id, v_production_meter_id, 12495, 12365, 130, '{"source":"development"}'::jsonb, 9750, 'Development current source output.')
  ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE SET reading_value = EXCLUDED.reading_value, previous_reading_value = EXCLUDED.previous_reading_value, consumption = EXCLUDED.consumption, revenue_amount = EXCLUDED.revenue_amount;

  IF NOT EXISTS (SELECT 1 FROM document_delivery_logs WHERE document_type = 'bill' AND document_id = v_held_bill_id AND recipient = 'dev-held@agua.local') THEN
    INSERT INTO document_delivery_logs (document_type, document_id, customer_id, channel, recipient, subject, status, error_message, sent_by)
    VALUES ('bill', v_held_bill_id, v_held_customer_id, 'email', 'dev-held@agua.local', 'Development failed bill delivery', 'failed', 'Development scenario: customer address requires review.', v_accountant_id);
  END IF;
END $$;
