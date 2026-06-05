# Implementation Records

This file records major implemented capabilities and important operating notes. Keep it updated after each release-sized change.

## Current Implemented Capability

Foundation:

- React frontend.
- Express API.
- PostgreSQL database.
- JWT authentication.
- Roles: admin, accountant, meter_reader, customer.

Customer and setup:

- Customer CRUD.
- Rates and zones.
- Effective-dated tariff versions and tariff blocks.
- Customer deposits, opening balances, account closure, and adjustments.
- Customer portal user links.

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
- Maintenance requests and linked maintenance expenses.
- Audit trail.
- Business settings and logo handling.

Production:

- Source production meters.
- Weekly production readings.
- Electricity top-ups.
- Top-ups post linked expenses.
- Dashboard production chart compares revenue and electricity cost.

Payroll:

- Payroll payees.
- Recurring employees/subscriptions.
- Period-only casuals/contractors.
- Payee termination.
- Payroll runs.
- Submit, approve, and paid lifecycle.
- Payroll expense posting.

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
038_hold_unallocated_source_backup_bills.sql
```

Important named scripts exist for many migrations, but not every numbered migration has a package script. Some are run directly through:

```powershell
node src/db/runSqlFile.js database/migrations/<file>.sql
```

Recommended hardening task:

- Add a formal migration tracking table and migration runner.

## Current Remaining Work

- Live-test SMTP, SMS, and WhatsApp providers with production credentials.
- Add M-Pesa/paybill integration or import workflow.
- Expand bank integration beyond PDF statement training.
- Add automated tests for high-risk billing, reading, payment, payroll, production, import, and correction flows.
- Complete role-by-role acceptance testing.
- Establish backup schedule and run restore drill.
- Decide scheduling, retries, and opt-out handling for bulk communications.

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
