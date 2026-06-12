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

## Database Files And Migrations

Use these files in pgAdmin, DBeaver, TablePlus, or another PostgreSQL DBMS when creating a database from scratch:

- Schema path: `server/database/schema.sql`
- Demo seed path: `server/database/seed.sql`
- Migration folder: `server/database/migrations/`

For a fresh database created from the latest `schema.sql`, import `schema.sql`, then `seed.sql`, then baseline the migration ledger once so the runner knows the schema is already current:

```powershell
cd server
npm.cmd run db:migrate:baseline
```

For all ongoing upgrades, use the tracked migration runner only:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

For an existing production database that was manually migrated before the migration ledger existed, run `npm.cmd run db:migrate:baseline` once after confirming the schema already includes the current migration set. After that one-time baseline, future schema changes are applied and recorded by `npm.cmd run db:migrate`.

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

## Automated Smoke Tests

The server smoke test uses Node's built-in test runner and only runs when `TEST_DATABASE_URL` is set. Point it at a disposable migrated and seeded test database, not production:

```powershell
cd server
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/agua_global_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run test:smoke
```

For a non-destructive smoke check against the database already configured in `server/.env`, skip migrate/seed and run:

```powershell
cd server
npm.cmd run test:smoke:current
```

By default, the smoke test logs in with the seeded admin:

```text
TEST_ADMIN_EMAIL=admin@agua.local
TEST_ADMIN_PASSWORD=Admin@123
```

To also verify business-viewer production read-only access, set:

```text
TEST_BUSINESS_VIEWER_EMAIL=<viewer email>
TEST_BUSINESS_VIEWER_PASSWORD=<viewer password>
```

On a disposable test database, also set `TEST_INCLUDE_WRITE_GUARD=1` to verify that business viewers cannot create production records.

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

For Vercel Cron, set `CRON_SECRET` in the API project. The app also accepts `REMINDER_CRON_SECRET` for non-Vercel schedulers. Call `GET /api/reminders/operational/cron` with `Authorization: Bearer <secret>` or the `x-reminder-cron-secret` header. Use `types=` if an external scheduler needs to split morning operational reminders from midday reading reminders:

```text
/api/reminders/operational/cron?types=pending_work,bill_preparation,contractor_invoices,payroll_preparation
/api/reminders/operational/cron?types=meter_readings,weekly_production_readings
```

Native Vercel Cron is configured in `server/vercel.json`:

```text
0 6 * * * -> /api/reminders/operational/cron
```

That UTC schedule is equivalent to 9:00 AM in East Africa Time and is compatible with Vercel Hobby cron limits. Use an external scheduler for a separate midday readings run if you need that timing without upgrading the Vercel plan.

## Application Monitoring

Business Settings includes an Application Monitoring panel for admin, accountant, and business viewer users. It summarizes recent API errors, database status failures, failed login attempts, and client page crashes using the viewer's browser/computer time for on-screen timestamps.

Before using it, make sure migrations are current:

```powershell
cd server
npm.cmd run db:migrate
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

On Vercel Hobby, the bundled Vercel Cron schedule calls `GET /api/monitoring/cron` once daily using `CRON_SECRET` or `MONITORING_CRON_SECRET`. For 15-minute monitoring, use an external uptime monitor to call:

```text
https://<api-domain>/api/monitoring/cron?secret=<MONITORING_CRON_SECRET-or-CRON_SECRET>
```

## Print And PDF Settings

Admins can set default print/PDF page behavior in Business Settings. The supported defaults are page size, orientation, margins, print scale, and a compression option for wide or long printouts.

Before using these controls, make sure migrations are current:

```powershell
cd server
npm.cmd run db:migrate
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

- Run `npm.cmd run db:migrate` from `server/` so delivery logs, contact preferences, campaigns, templates, and WhatsApp template metadata are installed.
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
