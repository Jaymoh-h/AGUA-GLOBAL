# AGUA Global Water Billing System

Full-stack water billing and customer management starter built with React, Node.js/Express, and PostgreSQL.

## Project Structure

```text
AGUA-GLOBAL/
  client/            React frontend
  server/            Express API
  server/database/   PostgreSQL schema and seed files
  docs/              Architecture, workflows, SOPs, deployment, API, and schema docs
```

## Documentation

The project documentation suite lives in [`docs/`](docs/README.md). It includes architecture, roles and permissions, billing and meter-reading workflows, deployment notes, backup/recovery SOPs, environment variables, API endpoints, database diagrams, test checklists, user manual notes, and implementation records.

## What Is Included

- JWT login/logout flow
- Roles: `admin`, `meter_reader`, `accountant`, `customer`, `business_viewer`
- User access contexts so one login can operate through an assigned role/profile
- Customer CRUD with account numbers and customer rates
- Rate and zone/location management for customer dropdowns
- Effective-dated tariff versions so billing uses the tariff active on the reading date
- Meter reading submission linked to customers
- Active meter tracking with previous reading visibility during reading entry
- Meter replacement workflow with old final readings, new meter baselines, and event history
- CSV reading imports with preview validation before committing rows
- Automatic bill creation from current and previous readings
- Editable meter readings that recalculate the affected bills
- Monthly billing periods with due dates on the last day of the following month
- Closed billing periods allow admin/accountant corrections only with an audit reason; locked periods require admin correction
- Billing settings for fixed penalties and default deposit rules
- Customer deposit tracking as paid or not paid
- Bill tracking with `unpaid`, `partial`, and `paid` states
- Receipt-level payments by selected customer, with allocation across oldest unpaid bills
- Payment channels for cash, bank, M-Pesa/paybill, and manual adjustments
- Editable receipts that reverse and reapply allocations
- Payment voiding with suspense handling for later reapplication or discard
- Printable receipts with business profile header, logo, allocations, and footer notes
- CSV payment imports with preview validation before committing receipts
- Bank statement PDF import trainer for extracting, mapping, and matching payments
- Expense register with manual entry and CSV imports
- Business settings for shared logo/contact/payment/footer details
- Business print defaults for page size, orientation, margins, scale, and wide-print compression
- Audit trail for customer, reading, bill, billing, payment, and meter changes
- Detailed audit record view with before/after change details
- User creation and role assignment
- Password reset by email when SMTP is configured
- Dashboard summaries for billed water units, cash collected, bills due, and arrears
- Customer portal with dashboard, bills, receipts, requests, and PDF statement download
- Multi-account customer portal linking
- Email/SMS/WhatsApp invoice and receipt delivery hooks with delivery history
- Communications center for invoice alerts, saved templates, campaigns, and campaign results
- WhatsApp sending through Twilio or Meta, including approved template metadata
- Supporting document uploads for maintenance requests, expenses, and contractor invoices
- Internal knowledge base for private SOPs, manuals, and controlled documents with role-based access
- Admin backup manifest, operational backup export, and local backup retention scripts
- Operational email reminders for pending work, meter readings, bill preparation, and payroll preparation
- Application monitoring for API errors, database status failures, login failures, and client page crashes
- Restore drill tracking and monitoring alert delivery by email/SMS
- Dual/source-side meter billing review and payability promotion
- Weekly production monitoring with source meters and electricity top-ups
- Production weekly reading context with previous prepaid kWh balance and previous meter readings
- Payroll management, payroll expense posting, and downloadable payslip PDFs
- Contractor invoice management with approval, document attachments, expense posting, and reporting
- Printable full or individual accountant reports with business profile header, logo, and footer notes
- REST API routes for the main resources

## Database Files For DBMS Import

Use these files in pgAdmin, DBeaver, TablePlus, or another PostgreSQL DBMS:

- Schema path: `server/database/schema.sql`
- Demo seed path: `server/database/seed.sql`
- Existing database migration path: `server/database/migrations/001_rates_zones.sql`
- Billing period/settings migration path: `server/database/migrations/002_billing_periods_settings.sql`
- Meter/readings migration path: `server/database/migrations/003_meters_reading_context.sql`
- Meter replacement events migration path: `server/database/migrations/004_meter_replacement_events.sql`
- Receipt-level payments migration path: `server/database/migrations/005_receipt_level_payments.sql`
- Audit trail migration path: `server/database/migrations/006_audit_events.sql`
- Expenses migration path: `server/database/migrations/007_expenses.sql`
- Business settings migration path: `server/database/migrations/008_business_settings.sql`
- Maintenance requests migration path: `server/database/migrations/009_maintenance_requests.sql`
- Tariff refinement migration path: `server/database/migrations/010_tariff_refinement.sql`
- Penalty applications migration path: `server/database/migrations/011_penalty_applications.sql`
- User password policy migration path: `server/database/migrations/012_user_password_policy.sql`
- Customer opening balances migration path: `server/database/migrations/013_customer_opening_balances.sql`
- Migration balance bills path: `server/database/migrations/014_migration_balance_bills.sql`
- Customer credits migration path: `server/database/migrations/015_customer_credits.sql`
- Numbering and account closure migration path: `server/database/migrations/016_numbering_and_account_closure.sql`
- Account closure and adjustments migration path: `server/database/migrations/017_account_closure_and_adjustments.sql`
- Penalty policy and waivers migration path: `server/database/migrations/018_penalty_policy_and_waivers.sql`
- Tariff effective dates migration path: `server/database/migrations/019_tariff_effective_dates.sql`
- Payment suspense migration path: `server/database/migrations/020_payment_suspense.sql`
- Dual meter billing migration path: `server/database/migrations/021_dual_meter_billing.sql`
- Production monitoring migration path: `server/database/migrations/022_production_monitoring.sql`
- Bill payability migration path: `server/database/migrations/023_bill_payability_promotion.sql`
- Payroll migration path: `server/database/migrations/024_payroll_management.sql`
- Password reset migration path: `server/database/migrations/025_password_reset_tokens.sql`
- Payroll expense posting migration path: `server/database/migrations/026_payroll_expense_posting.sql`
- Payroll lifecycle migration path: `server/database/migrations/027_payroll_lifecycle_and_period_payees.sql`
- Document delivery logs migration path: `server/database/migrations/028_document_delivery_logs.sql`
- Customer contact preferences migration path: `server/database/migrations/029_customer_contact_preferences.sql`
- Production top-up expenses migration path: `server/database/migrations/030_production_topup_expenses.sql`
- Communication campaigns migration path: `server/database/migrations/031_communication_campaigns.sql`
- Communication campaign names migration path: `server/database/migrations/032_communication_campaign_names.sql`
- Communication templates migration path: `server/database/migrations/033_communication_templates.sql`
- WhatsApp template metadata migration path: `server/database/migrations/034_whatsapp_template_metadata.sql`
- Production meter replacement migration path: `server/database/migrations/035_production_meter_replacement.sql`
- Maintenance expense links migration path: `server/database/migrations/036_maintenance_expense_links.sql`
- Portal user customer links migration path: `server/database/migrations/037_portal_user_customer_links.sql`
- Source backup bill hold cleanup migration path: `server/database/migrations/038_hold_unallocated_source_backup_bills.sql`
- Supporting documents migration path: `server/database/migrations/039_supporting_documents.sql`
- Contractor invoices migration path: `server/database/migrations/040_contractor_invoices.sql`
- User access profiles migration path: `server/database/migrations/041_user_access_profiles.sql`
- Migration tracking ledger path: `server/database/migrations/042_schema_migrations.sql`
- Knowledge documents migration path: `server/database/migrations/043_knowledge_documents.sql`
- Knowledge document database file storage migration path: `server/database/migrations/044_knowledge_document_file_data.sql`
- Operational reminder log migration path: `server/database/migrations/045_operational_reminders.sql`
- System event logs migration path: `server/database/migrations/046_system_event_logs.sql`
- Print page settings migration path: `server/database/migrations/047_print_page_settings.sql`
- Operational hardening migration path: `server/database/migrations/048_operational_hardening.sql`

Run `schema.sql` first, then `seed.sql`. If you create a fresh database from the latest `schema.sql`, also baseline the migration ledger so the runner knows those schema changes are already present:

```powershell
cd server
npm.cmd run db:migrate:baseline
```

For normal ongoing upgrades after the baseline exists, use:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

If you already imported the first version and have data in PostgreSQL, run this migration instead of dropping your database:

```text
server/database/migrations/001_rates_zones.sql
```

Then restart the server.

For the billing period and deposit fields, run:

```text
server/database/migrations/002_billing_periods_settings.sql
```

This preserves the existing bill and payment behavior while adding the richer billing fields.

For active meters and previous-reading context, run:

```text
server/database/migrations/003_meters_reading_context.sql
```

Or use the project command:

```powershell
cd server
npm.cmd run db:migrate:meters
```

For meter replacement events, run:

```powershell
cd server
npm.cmd run db:migrate:meter-events
```

For receipt-level payments, run:

```powershell
cd server
npm.cmd run db:migrate:payments
```

For audit trail events, run:

```powershell
cd server
npm.cmd run db:migrate:audit
```

For the expense register and expense CSV imports, run:

```powershell
cd server
npm.cmd run db:migrate:expenses
```

For shared business profile, logo path, contacts, payment details, and print footer notes, run:

```powershell
cd server
npm.cmd run db:migrate:business-settings
```

For configurable bill/receipt numbering and account closure support, run:

```powershell
cd server
npm.cmd run db:migrate:numbering
```

For final account closure tracking, deposit settlement history, and manual adjustment approvals, run:

```powershell
cd server
npm.cmd run db:migrate:account-adjustments
```

For percentage penalties and penalty waiver tracking, run:

```powershell
cd server
npm.cmd run db:migrate:penalty-policy
```

For effective-dated tariff history and historical billing, run:

```powershell
cd server
npm.cmd run db:migrate:tariff-effective-dates
```

For the later operational modules, run the matching scripts as needed:

```powershell
cd server
npm.cmd run db:migrate:payment-suspense
npm.cmd run db:migrate:dual-meter-billing
npm.cmd run db:migrate:production-monitoring
npm.cmd run db:migrate:bill-payability
npm.cmd run db:migrate:payroll
npm.cmd run db:migrate:password-reset
npm.cmd run db:migrate:payroll-expense-posting
npm.cmd run db:migrate:payroll-lifecycle
npm.cmd run db:migrate:document-delivery
npm.cmd run db:migrate:customer-contact-preferences
npm.cmd run db:migrate:production-topup-expenses
npm.cmd run db:migrate:communications
node src/db/runSqlFile.js database/migrations/032_communication_campaign_names.sql
node src/db/runSqlFile.js database/migrations/033_communication_templates.sql
node src/db/runSqlFile.js database/migrations/034_whatsapp_template_metadata.sql
node src/db/runSqlFile.js database/migrations/035_production_meter_replacement.sql
node src/db/runSqlFile.js database/migrations/036_maintenance_expense_links.sql
node src/db/runSqlFile.js database/migrations/037_portal_user_customer_links.sql
npm.cmd run db:migrate:hold-source-backup-bills
npm.cmd run db:migrate:supporting-documents
npm.cmd run db:migrate:contractor-invoices
npm.cmd run db:migrate:user-access-profiles
npm.cmd run db:migrate:knowledge-documents
npm.cmd run db:migrate:knowledge-document-file-data
npm.cmd run db:migrate:operational-reminders
npm.cmd run db:migrate:system-event-logs
npm.cmd run db:migrate:print-page-settings
npm.cmd run db:migrate:operational-hardening
```

After migration tracking is installed, prefer the tracked runner instead of individual migration scripts:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

For an existing database where migrations `001` through `041` were already applied manually, run this once after deploying the migration runner:

```powershell
cd server
npm.cmd run db:migrate:baseline
```

After that one-time baseline, future migration files are applied and recorded by `npm.cmd run db:migrate`.

## Backup And Retention

Admins can download an operational backup pack from Business Settings. For a local/server-side retained export, run:

```powershell
cd server
npm.cmd run db:backup
```

For monthly export plus retention pruning:

```powershell
cd server
npm.cmd run db:backup:monthly
```

Optional variables:

```text
BACKUP_DIR=J:\AGUA-BACKUPS
BACKUP_RETENTION_DAYS=180
```

The operational export excludes password hashes, reset tokens, and environment secrets. Knowledge base documents are included as base64 file data, so backup files must be stored securely. Use managed PostgreSQL/Neon backups or `pg_dump` for full disaster recovery.

Record restore tests in Business Settings after restoring a backup into a local/staging database. The app tracks the last drill, status, findings, and next quarterly due date. True PostgreSQL replication remains provider-managed; use Neon/provider point-in-time recovery, read replicas/branches, and provider backup alerts for that layer.

## Operational Reminders

Admin/accountant users can preview and send due operational reminder emails from Business Settings. The reminders cover pending work, end-month customer meter readings, weekly production readings, bill preparation, contractor invoices, and payroll preparation. Each reminder type is logged once per recipient per day to avoid accidental duplicate sends.

The configured timing rules are:

- End-month customer readings: daily for 7 days before the billing period `period_end`.
- Weekly production readings: midday for 2 days before the Monday reading date, on Monday, and for 2 days after if the reading is still missed.
- Contractor invoices: daily while invoices are not `posted_to_expense`, `paid`, or `rejected`.
- Pending work and bill preparation: weekdays while work needs attention.
- Payroll preparation: daily from the 25th through month end while payroll needs preparation, approval, or payment.

For a scheduled job, run:

```powershell
cd server
npm.cmd run ops:reminders
```

To run only selected reminder groups, pass a comma-separated list:

```powershell
cd server
npm.cmd run ops:reminders -- --types=meter_readings,weekly_production_readings
```

For Vercel Cron, set `CRON_SECRET` in the API project. The app also accepts `REMINDER_CRON_SECRET` for non-Vercel schedulers. Call `GET /api/reminders/operational/cron` with `Authorization: Bearer <secret>` or the `x-reminder-cron-secret` header. Use `types=` to split morning operational reminders from midday reading reminders:

```text
/api/reminders/operational/cron?types=pending_work,bill_preparation,contractor_invoices,payroll_preparation
/api/reminders/operational/cron?types=meter_readings,weekly_production_readings
```

Native Vercel Cron is configured in `server/vercel.json`:

```text
0 6 * * * -> /api/reminders/operational/cron/operations
0 9 * * * -> /api/reminders/operational/cron/readings
```

Those are UTC schedules, equivalent to 9:00 AM and midday in East Africa Time.

## Application Monitoring

The Reports page includes an Application Monitoring panel for admin, accountant, and business viewer users. It summarizes recent API errors, database status failures, failed login attempts, and client page crashes.

Before using it, run:

```powershell
cd server
npm.cmd run db:migrate:system-event-logs
```

The public `GET /api/status` endpoint still returns only API/database status, but database failures are also recorded internally when the monitoring migration is installed. The operational backup export includes the event log table for troubleshooting history.

Monitoring alerts can be sent by email and/or SMS when the scheduled check finds database failure or recent unresolved errors. Configure:

```text
MONITORING_ALERT_EMAILS=admin@example.com,ops@example.com
MONITORING_ALERT_PHONES=+2547...
MONITORING_ALERT_WINDOW_MINUTES=15
MONITORING_ALERT_COOLDOWN_MINUTES=60
PUBLIC_STATUS_URL=https://status.example.com
```

The Vercel Cron schedule calls `GET /api/monitoring/cron` every 15 minutes using `CRON_SECRET` or `MONITORING_CRON_SECRET`.

## Print And PDF Settings

Admins can set default print/PDF page behavior in Business Settings. The supported defaults are page size, orientation, margins, print scale, and a compression option for wide or long printouts.

Before using these controls, run:

```powershell
cd server
npm.cmd run db:migrate:print-page-settings
```

Browser print views for bills, receipts, reports, statements, production reports, and customer portal documents use these defaults when opening the print dialog. Server-generated bill, receipt, and payslip PDF attachments use the saved page size, orientation, and margins.

## Local Setup

Prerequisites: Node.js with npm, PostgreSQL, and a PostgreSQL DBMS such as pgAdmin or DBeaver if you want visual monitoring.

### 1. Create The Database

```sql
CREATE DATABASE agua_global;
```

Then import:

```text
server/database/schema.sql
server/database/seed.sql
```

### 2. Configure The Server

```bash
cd server
cp .env.example .env
npm install
npm run db:check
npm run dev
```

Default API URL: `http://localhost:5000/api`

Temporary demo admin login:

```text
Email: admin@agua.local
Password: Admin@123
```

Other seeded users:

```text
reader@agua.local / Reader@123
accountant@agua.local / Accountant@123
jane@agua.local / Customer@123
```

Seeded users are marked as temporary-password accounts and must set a new password after first login.

### 3. Run The Client

In a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Default frontend URL: `http://localhost:5173`

## Deploying To Vercel

This repository is a split app:

- `client/` is the Vite React frontend.
- `server/` is the Express API backed by PostgreSQL.

Create two Vercel projects from the same GitHub repository.

### 1. Production Database

Create a managed PostgreSQL database first. Import:

```text
server/database/schema.sql
server/database/seed.sql
```

Use a strong production admin password after the first login. If the database provider requires TLS, set `DATABASE_SSL=true` in the API project's environment variables.

For an existing production database that was already manually migrated through the current app version, baseline the migration ledger once:

```powershell
cd server
npm.cmd run db:migrate:baseline
```

For future production upgrades after that baseline, run:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

### 2. API Project

Import the GitHub repository into Vercel and use these settings:

```text
Root Directory: server
Framework Preset: Express
Install Command: npm install
Build Command: None
Output Directory: None
```

Add these environment variables in Vercel:

```text
DATABASE_URL=postgres://...
DATABASE_SSL=true
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=8h
CRON_SECRET=<long-random-secret-for-vercel-cron>
CLIENT_ORIGIN=https://<client-project>.vercel.app
LOGO_STORAGE_MODE=data-url
```

`CLIENT_ORIGIN` may contain a comma-separated list when the same client project serves public subdomains:

```text
CLIENT_ORIGIN=https://www.example.com,https://status.example.com,https://docs.example.com
```

Optional delivery environment variables:

```text
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
SMTP_FROM=<verified-sender-email>

SMS_PROVIDER=twilio
SMS_DEFAULT_COUNTRY_CODE=254
TWILIO_ACCOUNT_SID=<twilio-account-sid>
TWILIO_AUTH_TOKEN=<twilio-auth-token>
TWILIO_PHONE_NUMBER=<twilio-sms-number>
TWILIO_MESSAGING_SERVICE_SID=<optional-twilio-messaging-service-sid>

WHATSAPP_PROVIDER=twilio
WHATSAPP_DEFAULT_COUNTRY_CODE=254
WHATSAPP_TWILIO_ACCOUNT_SID=<twilio-account-sid>
WHATSAPP_TWILIO_AUTH_TOKEN=<twilio-auth-token>
WHATSAPP_TWILIO_FROM=<twilio-whatsapp-sender>
```

For Africa's Talking SMS instead of Twilio, use:

```text
SMS_PROVIDER=africastalking
AT_USERNAME=<africas-talking-username>
AT_API_KEY=<africas-talking-api-key>
AT_SENDER_ID=<optional-sender-id>
```

For Meta WhatsApp Cloud API instead of Twilio, use:

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=<meta-phone-number-id>
WHATSAPP_ACCESS_TOKEN=<meta-access-token>
WHATSAPP_API_VERSION=v20.0
```

After deployment, verify:

```text
https://<api-project>.vercel.app/api/health
```

### 3. Client Project

Import the same GitHub repository into a second Vercel project and use these settings:

```text
Root Directory: client
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Add this environment variable in Vercel:

```text
VITE_API_URL=https://<api-project>.vercel.app/api
```

After the client project has its final URL or custom domain, update the API project's `CLIENT_ORIGIN` to match it exactly and redeploy the API.

### Optional Public Subdomains

The client app can serve lightweight public pages from the same Vercel client project:

```text
https://status.<domain>  -> public status page
https://docs.<domain>    -> public documentation hub
```

Add each subdomain to the client Vercel project, point DNS as Vercel instructs, then add the resulting origins to the API project's `CLIENT_ORIGIN` list. The status page calls `GET /api/status`, which checks both the API and database connection. The existing `GET /api/health` remains available as a simple liveness check.

### Production Notes

- Keep `.env` files out of Git. Add secrets only in the Vercel dashboard.
- Rotate `JWT_SECRET` if a previous secret was ever committed or shared.
- `LOGO_STORAGE_MODE=data-url` stores uploaded business logos in PostgreSQL so they survive Vercel serverless deployments. Use `filesystem` only for local development or a server with durable disk storage.
- If a custom domain is added later, update both `VITE_API_URL` and `CLIENT_ORIGIN` to the new production URLs.

## Communications Setup

The Communications page can send invoice alerts by email, SMS, or WhatsApp to selected customers and records campaign history.

Before sending:

- Run migrations `028` through `034` for delivery logs, contact preferences, campaigns, templates, and WhatsApp template metadata.
- Add customer email/phone details and enable the intended delivery channel on the customer record.
- Configure SMTP for email, SMS provider variables for SMS, and WhatsApp provider variables for WhatsApp.
- Configure `CRON_SECRET` before enabling hosted operational reminder schedules on Vercel.
- For WhatsApp free-form sends, provider policy may still reject messages outside the allowed customer-service window.

For approved WhatsApp templates:

- In the Communications page, select `WhatsApp`.
- Save or update a communication template.
- Set `Approved template / Content SID`.
  - Meta uses the approved WhatsApp template name.
  - Twilio uses the Content SID, usually starting with `HX`.
- Set the language code, for example `en_US`.
- Add comma-separated variables in the same order as the approved template body placeholders, for example:

```text
customer_name, acc_number, invoice_period, total_outstanding, due_date
```

The message preview still shows the rendered internal alert body. When an approved WhatsApp template is configured, the provider receives the approved template payload plus the ordered variable values.

## Login Troubleshooting

If login says `Something went wrong` or `Database login failed`, check `server/.env`.

The default sample uses:

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5432/agua_global
```

Update the second `postgres` to your actual PostgreSQL password, or update both username and password if your local DBMS uses another account.

Then run:

```bash
cd server
npm run db:check
```

The check should confirm the database connection, show the imported tables, and report `password_ok=true` for the seeded users.

On Windows PowerShell, if `npm` is blocked by script execution policy, use:

```powershell
npm.cmd run db:check
npm.cmd run dev
```

## Remaining Work

Most core modules are now implemented. The remaining work is mainly hardening, automation, and larger external integrations:

- Run end-to-end test passes for billing, receipts, imports, corrections, payroll, production, reports, and customer portal flows.
- Add automated test coverage around high-risk money and meter-reading workflows.
- Complete live provider testing for SMS and WhatsApp after production credentials and approved templates are configured.
- Add M-Pesa/paybill transaction import or API integration.
- Add bank integration beyond the current PDF statement import trainer.
- Add retries and opt-out handling if bulk messaging volume grows.
- Use the migration runner/table for all future schema changes so applied migrations are tracked automatically.
- Decide long-term production storage and backup policy for supporting documents.
- Finish production deployment checks, provider backup/replication setup, and role-by-role user acceptance testing.
