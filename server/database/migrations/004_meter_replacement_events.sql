CREATE TABLE IF NOT EXISTS meter_events (
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

CREATE INDEX IF NOT EXISTS idx_meter_events_customer_date ON meter_events(customer_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_meter_events_old_meter_id ON meter_events(old_meter_id);
CREATE INDEX IF NOT EXISTS idx_meter_events_new_meter_id ON meter_events(new_meter_id);

ALTER TABLE meter_readings DROP CONSTRAINT IF EXISTS meter_readings_customer_id_reading_date_key;
ALTER TABLE meter_readings ADD CONSTRAINT meter_readings_meter_id_reading_date_key UNIQUE (meter_id, reading_date);
