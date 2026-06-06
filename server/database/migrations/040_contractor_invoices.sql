CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(40),
  email VARCHAR(160),
  tax_pin VARCHAR(80),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contractor_invoices (
  id SERIAL PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(120) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Contractor services',
  subtotal_amount NUMERIC(12, 2) NOT NULL CHECK (subtotal_amount >= 0),
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'posted_to_expense', 'paid')),
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contractor_id, invoice_number)
);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS contractor_invoice_id INTEGER REFERENCES contractor_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contractors_status ON contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractor_invoices_status ON contractor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_contractor_invoices_due_date ON contractor_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_contractor_invoices_contractor ON contractor_invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_expenses_contractor_invoice ON expenses(contractor_invoice_id);
