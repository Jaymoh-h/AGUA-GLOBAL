ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

UPDATE knowledge_documents
SET file_data = decode('', 'base64')
WHERE file_data IS NULL;

ALTER TABLE knowledge_documents
  ALTER COLUMN file_data SET NOT NULL;
