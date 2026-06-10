ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS print_page_size VARCHAR(20) NOT NULL DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS print_orientation VARCHAR(20) NOT NULL DEFAULT 'portrait',
  ADD COLUMN IF NOT EXISTS print_margin_mm NUMERIC(5, 2) NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS print_scale_percent INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS print_fit_to_page BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_print_page_size_check
    CHECK (print_page_size IN ('A4', 'A5', 'Letter', 'Legal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_print_orientation_check
    CHECK (print_orientation IN ('portrait', 'landscape'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_print_margin_mm_check
    CHECK (print_margin_mm BETWEEN 5 AND 30);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_print_scale_percent_check
    CHECK (print_scale_percent BETWEEN 75 AND 120);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
