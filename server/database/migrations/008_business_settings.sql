CREATE TABLE IF NOT EXISTS business_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name VARCHAR(180) NOT NULL DEFAULT 'AGUA Global',
  legal_name VARCHAR(180),
  logo_url TEXT,
  phone VARCHAR(80),
  email VARCHAR(160),
  physical_address TEXT,
  postal_address TEXT,
  tax_pin VARCHAR(80),
  paybill_number VARCHAR(80),
  till_number VARCHAR(80),
  bank_details TEXT,
  receipt_footer_note TEXT,
  report_footer_note TEXT,
  default_currency VARCHAR(10) NOT NULL DEFAULT 'KES',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
