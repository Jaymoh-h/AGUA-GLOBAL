CREATE TABLE IF NOT EXISTS document_delivery_logs (
  id SERIAL PRIMARY KEY,
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('bill', 'receipt')),
  document_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient VARCHAR(180) NOT NULL,
  subject VARCHAR(220),
  status VARCHAR(30) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  provider_message_id VARCHAR(180),
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_delivery_logs_document
  ON document_delivery_logs(document_type, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_delivery_logs_customer
  ON document_delivery_logs(customer_id, created_at DESC);
