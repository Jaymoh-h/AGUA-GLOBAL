ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_date DATE;

UPDATE customers
SET opening_balance_amount = COALESCE(opening_balance_amount, 0);
