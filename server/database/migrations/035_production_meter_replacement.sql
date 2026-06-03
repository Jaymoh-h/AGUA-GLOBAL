ALTER TABLE production_source_meters
  ADD COLUMN IF NOT EXISTS installed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS removed_at DATE,
  ADD COLUMN IF NOT EXISTS initial_reading NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_reading >= 0);

ALTER TABLE production_source_meters
  DROP CONSTRAINT IF EXISTS production_source_meters_status_check;

ALTER TABLE production_source_meters
  ADD CONSTRAINT production_source_meters_status_check
  CHECK (status IN ('active', 'inactive', 'replaced', 'removed', 'faulty'));

CREATE TABLE IF NOT EXISTS production_meter_events (
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

CREATE INDEX IF NOT EXISTS idx_production_meter_events_old ON production_meter_events(old_production_meter_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_meter_events_new ON production_meter_events(new_production_meter_id, event_date DESC);
