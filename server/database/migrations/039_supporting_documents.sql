CREATE TABLE IF NOT EXISTS supporting_documents (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL
    CHECK (entity_type IN ('maintenance_request', 'expense', 'contractor_invoice')),
  entity_id INTEGER NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(160) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  description TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supporting_documents_entity
  ON supporting_documents(entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_supporting_documents_uploaded_by
  ON supporting_documents(uploaded_by);
