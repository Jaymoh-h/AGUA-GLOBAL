ALTER TABLE supporting_documents
  DROP CONSTRAINT IF EXISTS supporting_documents_entity_type_check;

ALTER TABLE supporting_documents
  ADD CONSTRAINT supporting_documents_entity_type_check
  CHECK (entity_type IN ('maintenance_request', 'customer_reading_submission', 'expense', 'contractor_invoice'));
