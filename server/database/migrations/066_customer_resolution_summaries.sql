ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS customer_resolution_summary TEXT;
