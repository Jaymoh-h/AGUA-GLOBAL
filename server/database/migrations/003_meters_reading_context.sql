CREATE TABLE IF NOT EXISTS meters (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_number VARCHAR(80) NOT NULL UNIQUE,
  installed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_at DATE,
  initial_reading NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_reading >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'removed', 'faulty')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS meter_id INTEGER REFERENCES meters(id) ON DELETE SET NULL;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS billing_period_id INTEGER REFERENCES billing_periods(id) ON DELETE SET NULL;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS previous_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS previous_reading_value NUMERIC(12, 2);
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'field';
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO meters (customer_id, meter_number, installed_at, initial_reading, status, notes)
SELECT
  c.id,
  c.acc_number || '-MTR-1',
  COALESCE(MIN(mr.reading_date), CURRENT_DATE),
  COALESCE(
    (
      SELECT first_reading.reading_value
      FROM meter_readings first_reading
      WHERE first_reading.customer_id = c.id
      ORDER BY first_reading.reading_date ASC, first_reading.id ASC
      LIMIT 1
    ),
    0
  ),
  'active',
  'Generated from existing customer history'
FROM customers c
LEFT JOIN meter_readings mr ON mr.customer_id = c.id
WHERE NOT EXISTS (
  SELECT 1
  FROM meters existing
  WHERE existing.customer_id = c.id
    AND existing.status = 'active'
)
GROUP BY c.id, c.acc_number
ON CONFLICT (meter_number) DO NOTHING;

UPDATE meter_readings mr
SET meter_id = m.id
FROM meters m
WHERE mr.meter_id IS NULL
  AND m.customer_id = mr.customer_id
  AND m.status = 'active';

UPDATE meter_readings mr
SET billing_period_id = bp.id
FROM billing_periods bp
WHERE mr.billing_period_id IS NULL
  AND bp.period_start = date_trunc('month', mr.reading_date)::date;

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
WHERE mr.id = ordered.id
  AND (mr.previous_reading_id IS NULL OR mr.previous_reading_value IS NULL);

CREATE INDEX IF NOT EXISTS idx_meters_customer_status ON meters(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_meter_readings_billing_period_id ON meter_readings(billing_period_id);
