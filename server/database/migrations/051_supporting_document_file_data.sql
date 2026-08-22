ALTER TABLE supporting_documents
  ADD COLUMN IF NOT EXISTS file_data BYTEA;
