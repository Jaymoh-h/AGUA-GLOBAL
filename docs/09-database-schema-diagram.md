# Database Schema Diagram

The database is PostgreSQL. The base schema is in `server/database/schema.sql`; later feature additions are in `server/database/migrations/`.

## Major Entity Relationship Diagram

```mermaid
erDiagram
  rates ||--o{ customers : assigns
  zones ||--o{ customers : groups
  customers ||--o{ meters : owns
  customers ||--o{ meter_readings : receives
  customers ||--o{ bills : billed
  customers ||--o{ payments : pays
  customers ||--o{ maintenance_requests : raises
  customers ||--o{ portal_user_customers : linked_to

  users ||--o{ portal_user_customers : links
  users ||--o{ user_access_profiles : has
  users ||--o{ audit_events : acts
  users ||--o{ knowledge_documents : uploads
  users ||--o{ operational_reminder_logs : receives
  users ||--o{ system_event_logs : acts
  users ||--o{ backup_restore_drills : performs

  billing_periods ||--o{ meter_readings : contains
  billing_periods ||--o{ bills : contains
  billing_periods ||--o{ bill_penalty_applications : applies

  meters ||--o{ meter_readings : records
  meter_readings ||--o| bills : generates

  bills ||--o{ payment_allocations : allocated
  payments ||--o{ payment_allocations : splits
  payments ||--o{ payment_suspense_items : voids

  bills ||--o{ bill_penalty_applications : penalties
  source_billing_requests ||--o| bills : creates_held_bill

  expenses ||--o{ customer_deposit_transactions : linked
  maintenance_requests ||--o{ expenses : costs

  communication_campaigns ||--o{ communication_campaign_recipients : includes
  document_delivery_logs ||--o{ communication_campaign_recipients : logs
  contractors ||--o{ contractor_invoices : issues
  contractor_invoices ||--o| expenses : posts_to
  contractor_invoices ||--o{ supporting_documents : attaches
  expenses ||--o{ supporting_documents : attaches
  maintenance_requests ||--o{ supporting_documents : attaches

  production_source_meters ||--o{ production_meter_readings : records
  production_weekly_readings ||--o{ production_meter_readings : aggregates
```

## Core Tables

Customer and setup:

- `customers`
- `rates`
- `rate_versions`
- `rate_version_blocks`
- `tariff_blocks`
- `zones`
- `users`
- `user_access_profiles`
- `portal_user_customers`
- `password_reset_tokens`

Metering and billing:

- `meters`
- `meter_readings`
- `meter_events`
- `billing_periods`
- `billing_settings`
- `bills`
- `source_billing_requests`
- `bill_penalty_applications`

Payments and finance:

- `payments`
- `payment_allocations`
- `payment_suspense_items`
- `expenses`
- `customer_deposit_transactions`
- `customer_adjustments`

Operations:

- `maintenance_requests`
- `business_settings`
- `audit_events`
- `system_event_logs`
- `document_delivery_logs`
- `supporting_documents`
- `communication_campaigns`
- `communication_campaign_recipients`
- `communication_templates`
- `knowledge_documents`
- `operational_reminder_logs`
- `backup_restore_drills`
- `monitoring_alert_logs`

Production:

- `production_source_meters`
- `production_meter_events`
- `production_electricity_topups`
- `production_weekly_readings`
- `production_meter_readings`

Payroll, from migrations:

- `payroll_payees`
- `payroll_runs`
- `payroll_line_items`

Contractors, from migrations:

- `contractors`
- `contractor_invoices`

Migration and operations ledger:

- `schema_migrations`

## Important Relationships

- A customer belongs to one rate and one zone.
- A customer may have many meters, but only one should be active for normal billing.
- A meter reading belongs to a customer, optional billing period, and optional meter.
- A bill belongs to a customer and can reference previous and current readings.
- A payment belongs to a customer and can allocate across many bills.
- A payment allocation links one payment to one bill.
- A source billing request represents a reviewed backup/source-meter bill decision.
- Maintenance requests can create linked expenses.
- Production electricity top-ups create linked expenses.
- Communication campaigns store bulk-send history and recipient results.
- Portal users are linked to customer records through `portal_user_customers`.
- Access profiles give a user one or more selectable operating contexts.
- Supporting documents attach files to maintenance requests, expenses, and contractor invoices.
- Contractor invoices can be reviewed and posted into expenses.
- Knowledge documents store private SOP/manual/deployment files, role visibility, sensitivity, file metadata, and binary file data.
- Operational reminder logs record reminder sends by type, reminder key, recipient, channel, and due date to prevent duplicate sends.
- System event logs record operational errors, client events, failed logins, monitoring signals, and resolution state.
- Monitoring alert logs record alert send attempts, channel, recipients, payload snapshot, and cooldown history.
- Backup restore drills record quarterly recovery exercises, backup reference, target environment, duration, dataset count, findings, and follow-up actions.
- `business_settings` also stores print/PDF defaults such as page size, orientation, margin, scale, and fit-to-page behavior.
- `schema_migrations` records applied numbered SQL migrations with checksum, runtime, timestamp, and operator metadata.

## Migration Note

The project now uses numbered SQL files plus the `schema_migrations` ledger created by `042_schema_migrations.sql`. Use the tracked migration runner instead of manually guessing production state:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

The latest known migration is `048_operational_hardening.sql`.
