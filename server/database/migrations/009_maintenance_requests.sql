CREATE TABLE IF NOT EXISTS maintenance_requests (
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

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_customer ON maintenance_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_zone ON maintenance_requests(zone_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assigned_to ON maintenance_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_reported_at ON maintenance_requests(reported_at DESC);
