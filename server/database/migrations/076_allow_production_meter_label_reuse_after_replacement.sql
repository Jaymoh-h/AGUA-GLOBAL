-- A production label is a human-readable reporting name.  A replacement keeps
-- that name while its retired predecessor remains in history.
ALTER TABLE production_source_meters
  DROP CONSTRAINT IF EXISTS production_source_meters_meter_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_source_meters_current_meter_number
  ON production_source_meters(meter_number)
  WHERE status NOT IN ('replaced', 'removed');
