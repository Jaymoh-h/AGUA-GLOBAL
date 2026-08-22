CREATE TABLE IF NOT EXISTS customer_service_charges (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bill_id INTEGER UNIQUE REFERENCES bills(id) ON DELETE SET NULL,
  charge_number VARCHAR(80) UNIQUE,
  charge_type VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'payable'
    CHECK (status IN ('payable', 'waived', 'cancelled')),
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  linked_maintenance_request_id INTEGER REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  linked_meter_event_id INTEGER REFERENCES meter_events(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  waived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  waiver_reason TEXT,
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS bill_origin VARCHAR(30) NOT NULL DEFAULT 'meter_reading';

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_origin_check;
ALTER TABLE bills
  ADD CONSTRAINT bills_bill_origin_check
  CHECK (bill_origin IN ('meter_reading', 'opening_balance', 'manual_adjustment', 'service_charge', 'account_closure'));

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS service_charge_id INTEGER UNIQUE;

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_service_charge_id_fkey;
ALTER TABLE bills
  ADD CONSTRAINT bills_service_charge_id_fkey
  FOREIGN KEY (service_charge_id) REFERENCES customer_service_charges(id) ON DELETE SET NULL;

UPDATE bills
SET bill_origin = 'opening_balance'
WHERE bill_number LIKE 'MIG-%';

CREATE INDEX IF NOT EXISTS idx_customer_service_charges_customer_status
  ON customer_service_charges(customer_id, status, due_date, charge_date);

CREATE INDEX IF NOT EXISTS idx_customer_service_charges_charge_date
  ON customer_service_charges(charge_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bills_bill_origin
  ON bills(bill_origin, customer_id, status);
