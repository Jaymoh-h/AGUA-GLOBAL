-- Refresh only unchanged default invoice-alert templates. Deliberately preserve custom wording.
UPDATE communication_templates
SET body = E'{{business_name}}\nDear {{customer_name}} ({{acc_number}}),\n\n{{invoice_period}} water bill\n{{old_meter_consumption}}\n{{new_meter_consumption}}\n{{meter_consumption}}\n{{additional_charges}}\n\nPeriod charges: {{period_charges}}\nAmount due by {{due_date}}: {{period_amount_due}}\nPrevious arrears: {{arrears_after_payment}}\nTotal account balance: {{total_outstanding}}\n\n{{payment_information}}\nFor enquiries contact customer care on {{business_phone}}.',
    updated_at = NOW()
WHERE alert_type = 'invoice_alert'
  AND is_default = TRUE
  AND body = E'{{business_name}}\nDear, {{customer_name}}. {{acc_number}}\nCharges for {{invoice_period}}.\n{{old_meter_consumption}}\n{{new_meter_consumption}}\n{{meter_consumption}}\n{{additional_charges}}\nPeriod charges. {{period_charges}}\nPeriod amount due. {{period_amount_due}}\nArrears after payment. {{arrears_after_payment}}\nTotal outstanding. {{total_outstanding}}\nDue date. {{due_date}}\n{{payment_information}}\nFor enquiries contact customer care on {{business_phone}}.';
