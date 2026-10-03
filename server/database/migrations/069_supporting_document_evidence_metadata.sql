ALTER TABLE supporting_documents
  ADD COLUMN IF NOT EXISTS evidence_metadata JSONB,
  ADD COLUMN IF NOT EXISTS location_retention_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_supporting_documents_location_retention
  ON supporting_documents(location_retention_until)
  WHERE location_retention_until IS NOT NULL;
