-- Retains the individual reading spans that make up one customer bill.
-- This is used when a billing meter is replaced during an open billing period.
CREATE TABLE IF NOT EXISTS bill_meter_segments (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL,
  previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  current_reading_id INTEGER NOT NULL UNIQUE REFERENCES meter_readings(id) ON DELETE CASCADE,
  previous_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(12, 2) NOT NULL,
  units_used NUMERIC(12, 2) NOT NULL CHECK (units_used >= 0),
  segment_type VARCHAR(30) NOT NULL DEFAULT 'standard'
    CHECK (segment_type IN ('standard', 'replacement_old', 'replacement_new')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, current_reading_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_meter_segments_bill
  ON bill_meter_segments(bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_meter_segments_meter
  ON bill_meter_segments(meter_id, current_reading_id);
