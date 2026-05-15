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
- Meter reading submission linked to customers
- Automatic bill creation from current and previous readings
- Editable meter readings that recalculate the affected bills
- Bill tracking with `unpaid`, `partial`, and `paid` states
- Payments by selected customer, with allocation across oldest unpaid bills
- Editable payments that recalculate the linked bill status
- User creation and role assignment
- Dashboard summaries for billed water units, cash collected, bills due, and arrears
- REST API routes for the main resources

## Database Files For DBMS Import

Use these files in pgAdmin, DBeaver, TablePlus, or another PostgreSQL DBMS:

- Schema path: `server/database/schema.sql`
- Demo seed path: `server/database/seed.sql`
- Existing database migration path: `server/database/migrations/001_rates_zones.sql`

Run `schema.sql` first, then `seed.sql`.

If you already imported the first version and have data in PostgreSQL, run this migration instead of dropping your database:

```text
server/database/migrations/001_rates_zones.sql
```

Then restart the server.

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
