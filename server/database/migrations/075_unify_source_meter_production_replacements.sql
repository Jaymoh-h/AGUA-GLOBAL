ALTER TABLE production_meter_events
  ADD COLUMN IF NOT EXISTS meter_event_id INTEGER REFERENCES meter_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS old_previous_reading NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS old_consumption NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (old_consumption >= 0),
  ADD COLUMN IF NOT EXISTS old_revenue_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (old_revenue_amount >= 0),
  ADD COLUMN IF NOT EXISTS tariff_snapshot JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_meter_events_meter_event
  ON production_meter_events(meter_event_id)
  WHERE meter_event_id IS NOT NULL;
