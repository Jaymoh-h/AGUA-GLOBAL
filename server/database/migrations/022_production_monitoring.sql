CREATE TABLE IF NOT EXISTS production_source_meters (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  rate_id INTEGER REFERENCES rates(id) ON DELETE SET NULL,
  meter_number VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160),
  meter_type VARCHAR(30) NOT NULL DEFAULT 'shared_source' CHECK (meter_type IN ('customer_source', 'shared_source')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (meter_type = 'customer_source' AND customer_id IS NOT NULL)
    OR (meter_type = 'shared_source' AND rate_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS production_electricity_topups (
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

CREATE TABLE IF NOT EXISTS production_weekly_readings (
  id SERIAL PRIMARY KEY,
  reading_date DATE NOT NULL UNIQUE,
  prepaid_kwh_balance NUMERIC(12, 2) NOT NULL CHECK (prepaid_kwh_balance >= 0),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_meter_readings (
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

CREATE INDEX IF NOT EXISTS idx_production_source_meters_status ON production_source_meters(status, meter_type);
CREATE INDEX IF NOT EXISTS idx_production_weekly_readings_date ON production_weekly_readings(reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_meter_readings_meter ON production_meter_readings(production_meter_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_production_electricity_topups_date ON production_electricity_topups(topup_date DESC);
