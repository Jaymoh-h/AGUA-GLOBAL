CREATE TABLE IF NOT EXISTS knowledge_documents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'General',
  sensitivity VARCHAR(30) NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('internal', 'confidential', 'restricted')),
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['admin']::TEXT[],
  version_label VARCHAR(40) NOT NULL DEFAULT 'v1',
  summary TEXT,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(160) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  file_data BYTEA NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category
  ON knowledge_documents(category, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_allowed_roles
  ON knowledge_documents USING GIN (allowed_roles)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
  ON knowledge_documents(status)
  WHERE deleted_at IS NULL;
