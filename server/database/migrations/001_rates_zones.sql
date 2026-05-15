CREATE TABLE IF NOT EXISTS rates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rates (name, amount, description)
SELECT DISTINCT
  CASE
    WHEN rate = 75 THEN 'Domestic'
    WHEN rate = 85 THEN 'Commercial'
    WHEN rate = 70 THEN 'Institutional'
    ELSE 'Rate ' || rate::text
  END,
  rate,
  'Migrated from existing customer rate'
FROM customers
WHERE rate IS NOT NULL
ON CONFLICT (name) DO UPDATE
SET amount = EXCLUDED.amount,
    updated_at = NOW();

INSERT INTO zones (name, description)
SELECT DISTINCT location, 'Migrated from existing customer location'
FROM customers
WHERE location IS NOT NULL AND location <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS rate_id INTEGER REFERENCES rates(id) ON DELETE RESTRICT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id) ON DELETE RESTRICT;

UPDATE customers c
SET rate_id = r.id
FROM rates r
WHERE c.rate_id IS NULL
  AND r.amount = c.rate;

UPDATE customers c
SET zone_id = z.id
FROM zones z
WHERE c.zone_id IS NULL
  AND z.name = c.location;

ALTER TABLE customers ALTER COLUMN rate_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN zone_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_rate_id ON customers(rate_id);
CREATE INDEX IF NOT EXISTS idx_customers_zone_id ON customers(zone_id);
