ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'meter_reader', 'accountant', 'customer', 'business_viewer'));

CREATE TABLE IF NOT EXISTS user_access_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'meter_reader', 'accountant', 'customer', 'business_viewer')),
  label VARCHAR(120),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_profiles_default
  ON user_access_profiles(user_id)
  WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_user_active
  ON user_access_profiles(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_customer
  ON user_access_profiles(customer_id);

INSERT INTO user_access_profiles (user_id, role, label, customer_id, is_active, is_default)
SELECT
  u.id,
  u.role,
  CASE u.role
    WHEN 'admin' THEN 'Admin Console'
    WHEN 'accountant' THEN 'Accounting Console'
    WHEN 'meter_reader' THEN 'Meter Reader'
    WHEN 'customer' THEN 'Customer Portal'
    WHEN 'business_viewer' THEN 'Business Viewer'
    ELSE initcap(replace(u.role, '_', ' '))
  END,
  u.customer_id,
  u.is_active,
  TRUE
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM user_access_profiles uap
  WHERE uap.user_id = u.id
);
