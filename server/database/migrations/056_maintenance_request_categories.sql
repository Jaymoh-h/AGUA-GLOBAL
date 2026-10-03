ALTER TABLE maintenance_requests
  DROP CONSTRAINT IF EXISTS maintenance_requests_category_check;

ALTER TABLE maintenance_requests
  ADD CONSTRAINT maintenance_requests_category_check
  CHECK (category IN (
    'leak',
    'meter_fault',
    'no_water',
    'low_pressure',
    'water_quality',
    'connection',
    'billing_support',
    'billing_dispute',
    'payment_plan',
    'other'
  ));
