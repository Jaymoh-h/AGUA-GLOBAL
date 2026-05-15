CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS meter_readings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS rates CASCADE;

CREATE TABLE rates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
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
  location VARCHAR(180),
  acc_number VARCHAR(80) UNIQUE NOT NULL,
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  phone VARCHAR(40),
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'meter_reader', 'accountant', 'customer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE meter_readings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reading_value NUMERIC(12, 2) NOT NULL CHECK (reading_value >= 0),
  reading_date DATE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, reading_date)
);

CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  current_reading_id INTEGER UNIQUE REFERENCES meter_readings(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,
  previous_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(12, 2) NOT NULL,
  units_used NUMERIC(12, 2) NOT NULL CHECK (units_used >= 0),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method VARCHAR(60) NOT NULL DEFAULT 'cash',
  reference VARCHAR(120),
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_acc_number ON customers(acc_number);
CREATE INDEX idx_customers_rate_id ON customers(rate_id);
CREATE INDEX idx_customers_zone_id ON customers(zone_id);
CREATE INDEX idx_meter_readings_customer_date ON meter_readings(customer_id, reading_date DESC);
CREATE INDEX idx_bills_customer_status ON bills(customer_id, status);
CREATE INDEX idx_payments_customer_date ON payments(customer_id, payment_date DESC);
