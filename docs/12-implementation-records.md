# Implementation Records

This file records major implemented capabilities and important operating notes. Keep it updated after each release-sized change.

## Current Implemented Capability

Foundation:

- React frontend.
- Express API.
- PostgreSQL database.
- JWT authentication.
- Roles: admin, accountant, meter_reader, customer, business_viewer.
- Business viewer role for read-oriented oversight.
- User access profiles and login context selection.
- Tracked SQL migration runner with `schema_migrations` checksums and status output.

Customer and setup:

- Customer CRUD.
- Rates and zones.
- Effective-dated tariff versions and tariff blocks.
- Customer deposits, opening balances, account closure, and adjustments.
- Customer portal user links.
- Multi-account customer portal links.

Metering and billing:

- Active meters.
- Previous reading context.
- Meter replacement events.
- Reading imports.
- Editable readings and recalculated bills.
- Billing periods.
- Penalties, waivers, and reapplication.
- Source-side billing review and bill promotion.

Payments and finance:

- Receipt-level payments.
- Allocation across oldest unpaid bills.
- Editable payments.
- Suspense handling.
- Printable and sendable receipts.
- Payment imports.
- Expenses and expense imports.
- Bank statement PDF import trainer.

Operations:

- Dashboard with KPI cards and charts.
- Reports, accountant reports, data quality checks, and backup report.
- Backup manifest, operational backup export, and local retention scripts.
- Restore drill ledger with latest drill status and next quarterly due date.
- Backup exports include operational logs, monitoring logs, restore drills, and knowledge documents where the tables exist.
- Public status endpoint and status page for API/database checks.
- Application monitoring for API errors, database failures, failed logins, and client page crashes.
- Monitoring alert runner with email/SMS delivery, cooldown logging, and Vercel Cron path.
- Public documentation hub for a docs subdomain.
- Authenticated knowledge base for private SOPs, manuals, and controlled documents.
- Knowledge document downloads are recorded in the audit trail.
- Operational email reminders for pending work, end-month meter readings, weekly production readings, billing preparation, contractor invoices, and payroll preparation.
- Reminder schedules gate sends by due window and support `types` filtering for separate morning and midday cron runs.
- Reminder logs are recorded and included in operational backup exports.
- Maintenance requests and linked maintenance expenses.
- Supporting documents for maintenance requests, expenses, and contractor invoices.
- Audit trail.
- Business settings and logo handling.
- Business print/PDF defaults for page size, orientation, margins, scale, and wide-print compression.

Production:

- Source production meters.
- Weekly production readings.
- Electricity top-ups.
- Top-ups post linked expenses.
- Dashboard production chart compares revenue and electricity cost.
- Weekly production form shows previous prepaid kWh balance and previous meter readings for the selected date.
- Production reports show previous and current readings, and full print separates weekly summaries from meter details.

Payroll:

- Payroll payees.
- Recurring employees/subscriptions.
- Period-only casuals/contractors.
- Payee termination.
- Payroll runs.
- Submit, approve, and paid lifecycle.
- Payroll expense posting.
- Downloadable payslip PDFs from payroll line items.

Contractors:

- Contractor register.
- Contractor invoices with draft, submitted, approved, rejected, posted-to-expense, and paid states.
- Contractor invoice document attachments.
- Contractor invoice posting into expenses.
- Contractor payables, balances, and invoice register reporting.

Communications:

- Invoice alert preview.
- Single and bulk send.
- Campaign history.
- Campaign naming.
- Reusable templates.
- Email, SMS, and WhatsApp delivery paths.
- Approved WhatsApp template metadata for Meta and Twilio.

UX:

- Responsive layout across desktop, tablet, and mobile.
- Compact density pass.
- Desktop sidebar scroll.
- Fixed toast messages for success, failure, and notices.
- Dashboard chart headroom and responsive data ranges.

## Important Migration Notes

Latest known migration chain reaches:

```text
048_operational_hardening.sql
```

Use the tracked migration runner for ongoing upgrades:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

## Current Remaining Work

- Live-test SMTP, SMS, and WhatsApp providers with production credentials.
- Add M-Pesa/paybill integration or import workflow.
- Expand bank integration beyond PDF statement training.
- Add automated tests for high-risk billing, reading, payment, payroll, production, import, and correction flows.
- Complete role-by-role acceptance testing.
- Enable provider-native PostgreSQL point-in-time recovery/read replicas where the production database plan supports it.
- Consider third-party uptime checks that call `/api/status` from outside Vercel.
- Decide retries and opt-out handling for bulk communications.
- Decide long-term storage strategy for supporting documents in production.

## Release Log Template

Use this format for future entries:

```text
Date:
Branch/Commit:
Summary:
Files/Migrations:
Business Behavior:
Verification:
Known Follow-Up:
```
