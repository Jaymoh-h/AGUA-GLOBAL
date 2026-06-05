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
- Roles: `admin`, `meter_reader`, `accountant`, `customer`
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
- Audit trail for customer, reading, bill, billing, payment, and meter changes
- Detailed audit record view with before/after change details
- User creation and role assignment
- Password reset by email when SMTP is configured
- Dashboard summaries for billed water units, cash collected, bills due, and arrears
- Customer portal with dashboard, bills, receipts, requests, and PDF statement download
- Email/SMS/WhatsApp invoice and receipt delivery hooks with delivery history
- Communications center for invoice alerts, saved templates, campaigns, and campaign results
- WhatsApp sending through Twilio or Meta, including approved template metadata
- Dual/source-side meter billing review and payability promotion
- Weekly production monitoring with source meters and electricity top-ups
- Payroll management and payroll expense posting
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

Run `schema.sql` first, then `seed.sql`.

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
```

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

For an existing production database, run the latest migrations before redeploying the API code that uses them. The current improvement batches require:

```powershell
cd server
npm.cmd run db:migrate:numbering
npm.cmd run db:migrate:account-adjustments
npm.cmd run db:migrate:penalty-policy
npm.cmd run db:migrate:tariff-effective-dates
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
CLIENT_ORIGIN=https://<client-project>.vercel.app
LOGO_STORAGE_MODE=data-url
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

### Production Notes

- Keep `.env` files out of Git. Add secrets only in the Vercel dashboard.
- Rotate `JWT_SECRET` if a previous secret was ever committed or shared.
- `LOGO_STORAGE_MODE=data-url` stores uploaded business logos in PostgreSQL so they survive Vercel serverless deployments. Use `filesystem` only for local development or a server with durable disk storage.
- If a custom domain is added later, update both `VITE_API_URL` and `CLIENT_ORIGIN` to the new production URLs.

## Communications Setup

The Communications page can send invoice alerts by email, SMS, or WhatsApp to selected customers and records campaign history.

Before sending:

- Run migrations `028` through `034`.
- Add customer email/phone details and enable the intended delivery channel on the customer record.
- Configure SMTP for email, SMS provider variables for SMS, and WhatsApp provider variables for WhatsApp.
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
- Add email/SMS/WhatsApp scheduling, retries, and opt-out handling if bulk messaging volume grows.
- Add a formal migration runner/table so applied migrations are tracked automatically.
- Finish production deployment checks, backups, restore drills, and role-by-role user acceptance testing.
