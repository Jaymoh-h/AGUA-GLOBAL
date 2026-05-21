# AGUA Global Water Billing System

Full-stack water billing and customer management starter built with React, Node.js/Express, and PostgreSQL.

## Project Structure

```text
AGUA-GLOBAL/
  client/            React frontend
  server/            Express API
  server/database/   PostgreSQL schema and seed files
```

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
- Printable receipts with business profile header, logo, allocations, and footer notes
- CSV payment imports with preview validation before committing receipts
- Expense register with manual entry and CSV imports
- Business settings for shared logo/contact/payment/footer details
- Audit trail for customer, reading, bill, billing, payment, and meter changes
- User creation and role assignment
- Dashboard summaries for billed water units, cash collected, bills due, and arrears
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

Demo admin login:

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

## Important Next Requirements To Decide

These are the decisions that will shape the next version:

- Billing period rules: monthly closing date, due date, penalties, and deposits.
- Meter replacement workflow: how to reset or transfer previous readings.
- Payment integrations: manual cash, bank, M-Pesa/paybill, receipt numbers.
- Customer portal scope: whether customers can view bills, download receipts, or submit complaints.
- Tariffs: single flat rate now; future blocks, fixed charges, VAT, reconnection fees, or exemptions.
- Audit trail: who changed customers, readings, bills, and payments.
- Reports: regulatory reports, accountant exports, aging analysis, and route summaries for meter readers.
