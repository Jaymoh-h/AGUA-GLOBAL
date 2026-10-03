CREATE TABLE customer_reading_submissions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
  reading_value NUMERIC(12, 2) NOT NULL CHECK (reading_value >= 0),
  reading_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  official_reading_id INTEGER REFERENCES meter_readings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customer_reading_submissions_pending_meter_date
  ON customer_reading_submissions(meter_id, reading_date)
  WHERE status = 'pending';

CREATE INDEX idx_customer_reading_submissions_review_queue
  ON customer_reading_submissions(status, submitted_at DESC);

CREATE INDEX idx_customer_reading_submissions_customer
  ON customer_reading_submissions(customer_id, submitted_at DESC);
