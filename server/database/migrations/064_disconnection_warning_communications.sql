ALTER TABLE communication_templates
  DROP CONSTRAINT IF EXISTS communication_templates_alert_type_check;

ALTER TABLE communication_templates
  ADD CONSTRAINT communication_templates_alert_type_check
  CHECK (alert_type IN ('invoice_alert', 'payment_plan_alert', 'standing_order_alert', 'disconnection_warning'));

ALTER TABLE communication_campaigns
  DROP CONSTRAINT IF EXISTS communication_campaigns_alert_type_check;

ALTER TABLE communication_campaigns
  ADD CONSTRAINT communication_campaigns_alert_type_check
  CHECK (alert_type IN ('invoice_alert', 'payment_plan_alert', 'standing_order_alert', 'disconnection_warning'));

ALTER TABLE document_delivery_logs
  DROP CONSTRAINT IF EXISTS document_delivery_logs_document_type_check;

ALTER TABLE document_delivery_logs
  ADD CONSTRAINT document_delivery_logs_document_type_check
  CHECK (document_type IN ('bill', 'receipt', 'payment_arrangement', 'standing_order', 'disconnection_warning'));
