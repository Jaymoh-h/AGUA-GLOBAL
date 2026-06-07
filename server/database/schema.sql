CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS production_meter_readings CASCADE;
DROP TABLE IF EXISTS production_weekly_readings CASCADE;
DROP TABLE IF EXISTS production_electricity_topups CASCADE;
DROP TABLE IF EXISTS production_source_meters CASCADE;
DROP TABLE IF EXISTS source_billing_requests CASCADE;
DROP TABLE IF EXISTS customer_adjustments CASCADE;
DROP TABLE IF EXISTS customer_deposit_transactions CASCADE;
DROP TABLE IF EXISTS bill_penalty_applications CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS meter_readings CASCADE;
DROP TABLE IF EXISTS meter_events CASCADE;
DROP TABLE IF EXISTS meters CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS billing_settings CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS billing_periods CASCADE;
DROP TABLE IF EXISTS user_access_profiles CASCADE;
DROP TABLE IF EXISTS portal_user_customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS rate_version_blocks CASCADE;
DROP TABLE IF EXISTS rate_versions CASCADE;
DROP TABLE IF EXISTS tariff_blocks CASCADE;
DROP TABLE IF EXISTS rates CASCADE;

CREATE TABLE rates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  tariff_type VARCHAR(20) NOT NULL DEFAULT 'flat' CHECK (tariff_type IN ('flat', 'block')),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  exemption_notes TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL DEFAULT DATE '1900-01-01',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tariff_blocks (
  id SERIAL PRIMARY KEY,
  rate_id INTEGER NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  min_units NUMERIC(12, 2) NOT NULL CHECK (min_units >= 0),
  max_units NUMERIC(12, 2) CHECK (max_units > min_units),
  unit_rate NUMERIC(12, 2) NOT NULL CHECK (unit_rate >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  rate_id INTEGER NOT NULL REFERENCES rates(id) ON DELETE RESTRICT,
  zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(160),
  location VARCHAR(180),
  acc_number VARCHAR(80) UNIQUE NOT NULL,
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  deposit_paid BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_paid_at DATE,
  opening_balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  opening_balance_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  closed_at TIMESTAMPTZ,
  closed_by INTEGER,
  closure_bill_id INTEGER,
  closure_reason TEXT,
  preferred_delivery_channel VARCHAR(30) NOT NULL DEFAULT 'email' CHECK (preferred_delivery_channel IN ('email', 'sms', 'whatsapp')),
  email_delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  phone VARCHAR(40),
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'meter_reader', 'accountant', 'customer', 'business_viewer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip VARCHAR(80),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_active
  ON password_reset_tokens(user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE user_access_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'meter_reader', 'accountant', 'customer', 'business_viewer')),
  label VARCHAR(120),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_access_profiles_default
  ON user_access_profiles(user_id)
  WHERE is_default = TRUE;

CREATE INDEX idx_user_access_profiles_user_active
  ON user_access_profiles(user_id, is_active);

CREATE INDEX idx_user_access_profiles_customer
  ON user_access_profiles(customer_id);

CREATE TABLE portal_user_customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  linked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_id)
);

CREATE UNIQUE INDEX idx_portal_user_customers_primary
  ON portal_user_customers(user_id)
  WHERE is_primary = TRUE;

CREATE INDEX idx_portal_user_customers_customer
  ON portal_user_customers(customer_id);

CREATE TABLE document_delivery_logs (
  id SERIAL PRIMARY KEY,
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('bill', 'receipt')),
  document_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient VARCHAR(180) NOT NULL,
  subject VARCHAR(220),
  status VARCHAR(30) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  provider_message_id VARCHAR(180),
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_delivery_logs_document
  ON document_delivery_logs(document_type, document_id, created_at DESC);

CREATE INDEX idx_document_delivery_logs_customer
  ON document_delivery_logs(customer_id, created_at DESC);

CREATE TABLE communication_campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name VARCHAR(160) NOT NULL DEFAULT 'Invoice alert',
  alert_type VARCHAR(40) NOT NULL DEFAULT 'invoice_alert'
    CHECK (alert_type IN ('invoice_alert')),
  medium VARCHAR(30) NOT NULL
    CHECK (medium IN ('email', 'sms', 'whatsapp')),
  template TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE communication_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  recipient VARCHAR(180),
  status VARCHAR(30) NOT NULL
    CHECK (status IN ('sent', 'skipped', 'failed')),
  error_message TEXT,
  delivery_log_id INTEGER REFERENCES document_delivery_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_communication_campaigns_created
  ON communication_campaigns(created_at DESC);

CREATE INDEX idx_communication_campaign_recipients_campaign
  ON communication_campaign_recipients(campaign_id, status);

CREATE INDEX idx_communication_campaign_recipients_customer
  ON communication_campaign_recipients(customer_id, created_at DESC);

CREATE TABLE communication_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  alert_type VARCHAR(40) NOT NULL DEFAULT 'invoice_alert'
    CHECK (alert_type IN ('invoice_alert')),
  medium VARCHAR(30) NOT NULL
    CHECK (medium IN ('email', 'sms', 'whatsapp')),
  body TEXT NOT NULL,
  whatsapp_template_name VARCHAR(160),
  whatsapp_template_language VARCHAR(20) NOT NULL DEFAULT 'en_US',
  whatsapp_template_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_communication_templates_name_medium
  ON communication_templates(LOWER(name), medium, alert_type);

CREATE INDEX idx_communication_templates_medium
  ON communication_templates(medium, alert_type, is_default DESC, name ASC);

CREATE INDEX idx_communication_templates_whatsapp_name
  ON communication_templates(whatsapp_template_name)
  WHERE whatsapp_template_name IS NOT NULL;

CREATE TABLE rate_versions (
  id SERIAL PRIMARY KEY,
  rate_id INTEGER NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  name VARCHAR(120) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  tariff_type VARCHAR(20) NOT NULL DEFAULT 'flat' CHECK (tariff_type IN ('flat', 'block')),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  exemption_notes TEXT,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rate_id, effective_from)
);

CREATE TABLE rate_version_blocks (
  id SERIAL PRIMARY KEY,
  rate_version_id INTEGER NOT NULL REFERENCES rate_versions(id) ON DELETE CASCADE,
  min_units NUMERIC(12, 2) NOT NULL CHECK (min_units >= 0),
  max_units NUMERIC(12, 2) CHECK (max_units > min_units),
  unit_rate NUMERIC(12, 2) NOT NULL CHECK (unit_rate >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_periods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  period_start DATE UNIQUE NOT NULL,
  period_end DATE NOT NULL,
  closing_date DATE NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'locked')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (closing_date >= period_start),
  CHECK (bill_date >= period_start),
  CHECK (due_date >= bill_date)
);

CREATE TABLE billing_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  due_rule VARCHAR(40) NOT NULL DEFAULT 'next_month_end' CHECK (due_rule IN ('next_month_end')),
  penalty_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (penalty_grace_days >= 0),
  penalty_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (penalty_type IN ('none', 'fixed', 'percentage')),
  penalty_value NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (penalty_value >= 0),
  deposit_required BOOLEAN NOT NULL DEFAULT FALSE,
  default_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (default_deposit_amount >= 0),
  bill_number_prefix VARCHAR(24) NOT NULL DEFAULT 'BILL',
  bill_number_next INTEGER NOT NULL DEFAULT 1 CHECK (bill_number_next > 0),
  receipt_number_prefix VARCHAR(24) NOT NULL DEFAULT 'RCPT',
  receipt_number_next INTEGER NOT NULL DEFAULT 1 CHECK (receipt_number_next > 0),
  number_padding INTEGER NOT NULL DEFAULT 6 CHECK (number_padding BETWEEN 3 AND 12),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing_settings (id) VALUES (1);

CREATE TABLE business_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name VARCHAR(180) NOT NULL DEFAULT 'AGUA Global',
  legal_name VARCHAR(180),
  logo_url TEXT,
  phone VARCHAR(80),
  email VARCHAR(160),
  physical_address TEXT,
  postal_address TEXT,
  tax_pin VARCHAR(80),
  paybill_number VARCHAR(80),
  till_number VARCHAR(80),
  bank_details TEXT,
  receipt_footer_note TEXT,
  report_footer_note TEXT,
  default_currency VARCHAR(10) NOT NULL DEFAULT 'KES',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_settings (id) VALUES (1);

CREATE TABLE meters (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_number VARCHAR(80) NOT NULL UNIQUE,
  meter_role VARCHAR(30) NOT NULL DEFAULT 'client_billing' CHECK (meter_role IN ('client_billing', 'source_backup', 'shared_source_monitoring')),
  installed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_at DATE,
  initial_reading NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_reading >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'removed', 'faulty')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE meter_readings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  previous_reading_value NUMERIC(12, 2),
  reading_value NUMERIC(12, 2) NOT NULL CHECK (reading_value >= 0),
  reading_date DATE NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'field',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meter_id, reading_date)
);

CREATE TABLE meter_events (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  old_meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  new_meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('install', 'replacement', 'removal', 'fault')),
  event_date DATE NOT NULL,
  old_final_reading NUMERIC(12, 2),
  new_initial_reading NUMERIC(12, 2),
  reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  bill_number VARCHAR(80) UNIQUE,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  current_reading_id INTEGER UNIQUE REFERENCES meter_readings(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,
  previous_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(12, 2) NOT NULL,
  units_used NUMERIC(12, 2) NOT NULL CHECK (units_used >= 0),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  penalty_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  deposit_applied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_applied_amount >= 0),
  adjustment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  tariff_snapshot JSONB,
  balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  billing_meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  billing_meter_role VARCHAR(30) NOT NULL DEFAULT 'client_billing' CHECK (billing_meter_role IN ('client_billing', 'source_backup', 'shared_source_monitoring')),
  billing_source VARCHAR(30) NOT NULL DEFAULT 'client_meter' CHECK (billing_source IN ('client_meter', 'source_backup')),
  source_fallback_reason TEXT,
  source_billing_request_id INTEGER,
  bill_pay_status VARCHAR(20) NOT NULL DEFAULT 'payable' CHECK (bill_pay_status IN ('payable', 'held', 'superseded')),
  payability_reason TEXT,
  promoted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers
  ADD CONSTRAINT customers_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT customers_closure_bill_id_fkey FOREIGN KEY (closure_bill_id) REFERENCES bills(id) ON DELETE SET NULL;

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method VARCHAR(60) NOT NULL DEFAULT 'cash',
  reference VARCHAR(120),
  receipt_number VARCHAR(80) UNIQUE,
  payment_channel VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (payment_channel IN ('cash', 'bank', 'mpesa_paybill', 'manual_adjustment')),
  external_reference VARCHAR(120),
  received_from VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void', 'voided_to_suspense')),
  total_allocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_allocated_amount >= 0),
  unallocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, bill_id)
);

CREATE TABLE payment_suspense_items (
  id SERIAL PRIMARY KEY,
  source_payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  receipt_number VARCHAR(80),
  payment_channel VARCHAR(30),
  external_reference VARCHAR(120),
  received_from VARCHAR(160),
  payment_date DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'reapplied', 'discarded')),
  reapplied_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  discard_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bill_penalty_applications (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  application_month DATE NOT NULL,
  applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  penalty_type VARCHAR(20),
  penalty_value NUMERIC(12, 2),
  principal_amount NUMERIC(12, 2),
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  waived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  waiver_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, application_month)
);

CREATE TABLE source_billing_requests (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  current_reading_id INTEGER UNIQUE NOT NULL REFERENCES meter_readings(id) ON DELETE CASCADE,
  previous_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(12, 2) NOT NULL,
  units_used NUMERIC(12, 2) NOT NULL CHECK (units_used >= 0),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  fixed_charge_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_amount >= 0),
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  reconnection_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reconnection_fee_amount >= 0),
  tariff_snapshot JSONB,
  due_date DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bills
  ADD CONSTRAINT bills_source_billing_request_id_fkey FOREIGN KEY (source_billing_request_id) REFERENCES source_billing_requests(id) ON DELETE SET NULL;

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(80) NOT NULL,
  vendor VARCHAR(160),
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_channel VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (payment_channel IN ('cash', 'bank', 'mpesa_paybill', 'manual_adjustment')),
  reference VARCHAR(120),
  receipt_number VARCHAR(80),
  maintenance_request_id INTEGER REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_deposit_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL CHECK (action IN ('applied', 'refunded', 'forfeited', 'transferred')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_adjustments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(40) UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other'
    CHECK (category IN ('leak', 'meter_fault', 'no_water', 'low_pressure', 'water_quality', 'connection', 'billing_support', 'other')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
  source VARCHAR(30) NOT NULL DEFAULT 'internal'
    CHECK (source IN ('internal', 'field', 'customer_portal', 'phone', 'walk_in', 'other')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_date DATE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_source_meters (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  rate_id INTEGER REFERENCES rates(id) ON DELETE SET NULL,
  meter_number VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160),
  meter_type VARCHAR(30) NOT NULL DEFAULT 'shared_source' CHECK (meter_type IN ('customer_source', 'shared_source')),
  installed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_at DATE,
  initial_reading NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_reading >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'replaced', 'removed', 'faulty')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (meter_type = 'customer_source' AND customer_id IS NOT NULL)
    OR (meter_type = 'shared_source' AND rate_id IS NOT NULL)
  )
);

CREATE TABLE production_meter_events (
  id SERIAL PRIMARY KEY,
  old_production_meter_id INTEGER REFERENCES production_source_meters(id) ON DELETE SET NULL,
  new_production_meter_id INTEGER REFERENCES production_source_meters(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL DEFAULT 'replacement' CHECK (event_type IN ('replacement', 'removal', 'fault')),
  event_date DATE NOT NULL,
  old_final_reading NUMERIC(12, 2),
  new_initial_reading NUMERIC(12, 2),
  reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_electricity_topups (
  id SERIAL PRIMARY KEY,
  topup_date DATE NOT NULL,
  kwh_units NUMERIC(12, 2) NOT NULL CHECK (kwh_units > 0),
  total_cost NUMERIC(12, 2) NOT NULL CHECK (total_cost >= 0),
  cost_per_unit NUMERIC(12, 4) NOT NULL CHECK (cost_per_unit >= 0),
  reference VARCHAR(120),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_weekly_readings (
  id SERIAL PRIMARY KEY,
  reading_date DATE NOT NULL UNIQUE,
  prepaid_kwh_balance NUMERIC(12, 2) NOT NULL CHECK (prepaid_kwh_balance >= 0),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_meter_readings (
  id SERIAL PRIMARY KEY,
  weekly_reading_id INTEGER NOT NULL REFERENCES production_weekly_readings(id) ON DELETE CASCADE,
  production_meter_id INTEGER NOT NULL REFERENCES production_source_meters(id) ON DELETE CASCADE,
  reading_value NUMERIC(12, 2) NOT NULL CHECK (reading_value >= 0),
  previous_reading_value NUMERIC(12, 2),
  consumption NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (consumption >= 0),
  tariff_snapshot JSONB,
  revenue_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (revenue_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (weekly_reading_id, production_meter_id)
);

CREATE TABLE audit_events (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id INTEGER,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  ip_address VARCHAR(80),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_acc_number ON customers(acc_number);
CREATE INDEX idx_tariff_blocks_rate_order ON tariff_blocks(rate_id, sort_order, min_units);
CREATE INDEX idx_rate_versions_rate_effective ON rate_versions(rate_id, effective_from DESC);
CREATE INDEX idx_rate_version_blocks_version_order ON rate_version_blocks(rate_version_id, sort_order, min_units);
CREATE INDEX idx_customers_rate_id ON customers(rate_id);
CREATE INDEX idx_customers_zone_id ON customers(zone_id);
CREATE INDEX idx_meters_customer_status ON meters(customer_id, status);
CREATE INDEX idx_meters_customer_role_status ON meters(customer_id, meter_role, status);
CREATE INDEX idx_meter_events_customer_date ON meter_events(customer_id, event_date DESC);
CREATE INDEX idx_meter_events_old_meter_id ON meter_events(old_meter_id);
CREATE INDEX idx_meter_events_new_meter_id ON meter_events(new_meter_id);
CREATE INDEX idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date DESC);
CREATE INDEX idx_meter_readings_billing_period_id ON meter_readings(billing_period_id);
CREATE INDEX idx_meter_readings_customer_date ON meter_readings(customer_id, reading_date DESC);
CREATE INDEX idx_billing_periods_status ON billing_periods(status);
CREATE INDEX idx_bills_billing_period_id ON bills(billing_period_id);
CREATE INDEX idx_bills_customer_status ON bills(customer_id, status);
CREATE INDEX idx_bills_billing_meter_id ON bills(billing_meter_id);
CREATE INDEX idx_bills_customer_period_pay_status ON bills(customer_id, billing_period_id, bill_pay_status);
CREATE INDEX idx_payments_customer_date ON payments(customer_id, payment_date DESC);
CREATE INDEX idx_expenses_maintenance_request ON expenses(maintenance_request_id, expense_date DESC);
CREATE INDEX idx_payments_receipt_number ON payments(receipt_number);
CREATE INDEX idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_bill_id ON payment_allocations(bill_id);
CREATE INDEX idx_payment_suspense_status ON payment_suspense_items(status);
CREATE INDEX idx_payment_suspense_source_payment ON payment_suspense_items(source_payment_id);
CREATE INDEX idx_payment_suspense_customer ON payment_suspense_items(customer_id);
CREATE INDEX idx_bill_penalty_applications_bill_id ON bill_penalty_applications(bill_id);
CREATE INDEX idx_bill_penalty_applications_application_month ON bill_penalty_applications(application_month DESC);
CREATE INDEX idx_bill_penalty_applications_waived_at ON bill_penalty_applications(waived_at);
CREATE INDEX idx_source_billing_requests_status ON source_billing_requests(status, created_at DESC);
CREATE INDEX idx_source_billing_requests_customer ON source_billing_requests(customer_id, created_at DESC);
CREATE INDEX idx_production_meter_events_old ON production_meter_events(old_production_meter_id, event_date DESC);
CREATE INDEX idx_production_meter_events_new ON production_meter_events(new_production_meter_id, event_date DESC);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_recorded_by ON expenses(recorded_by);
CREATE INDEX idx_customer_deposit_transactions_customer ON customer_deposit_transactions(customer_id, transaction_date DESC);
CREATE INDEX idx_customer_adjustments_status ON customer_adjustments(status, created_at DESC);
CREATE INDEX idx_customer_adjustments_customer ON customer_adjustments(customer_id, created_at DESC);
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_requests_customer ON maintenance_requests(customer_id);
CREATE INDEX idx_maintenance_requests_zone ON maintenance_requests(zone_id);
CREATE INDEX idx_maintenance_requests_assigned_to ON maintenance_requests(assigned_to);
CREATE INDEX idx_maintenance_requests_reported_at ON maintenance_requests(reported_at DESC);
CREATE INDEX idx_production_source_meters_status ON production_source_meters(status, meter_type);
CREATE INDEX idx_production_weekly_readings_date ON production_weekly_readings(reading_date DESC);
CREATE INDEX idx_production_meter_readings_meter ON production_meter_readings(production_meter_id, id DESC);
CREATE INDEX idx_production_electricity_topups_date ON production_electricity_topups(topup_date DESC);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);
