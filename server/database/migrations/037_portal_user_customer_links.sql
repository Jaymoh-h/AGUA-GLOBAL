CREATE TABLE IF NOT EXISTS portal_user_customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  linked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_user_customers_primary
  ON portal_user_customers(user_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_portal_user_customers_customer
  ON portal_user_customers(customer_id);

INSERT INTO portal_user_customers (user_id, customer_id, is_primary)
SELECT id, customer_id, TRUE
FROM users
WHERE role = 'customer'
  AND customer_id IS NOT NULL
ON CONFLICT (user_id, customer_id) DO UPDATE
SET is_primary = TRUE;
