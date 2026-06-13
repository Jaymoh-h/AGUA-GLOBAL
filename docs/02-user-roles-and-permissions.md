# User Roles And Permissions

AGUA Global uses five primary roles:

- `admin`
- `accountant`
- `meter_reader`
- `customer`
- `business_viewer`

Permissions are enforced mainly in route files under `server/src/routes/` using HttpOnly JWT session cookies, CSRF checks for browser writes, and role guards.

## Role Summary

| Role | Primary Purpose | Typical Access |
| --- | --- | --- |
| `admin` | System owner and operations controller | Full operational access, user management, high-risk approvals, monitoring, restore drills |
| `accountant` | Finance and billing operator | Customers, billing, payments, expenses, reports, payroll, communications, reminders |
| `meter_reader` | Field operations user | Customers, readings, meters, maintenance, production readings, dashboard, shared knowledge documents |
| `customer` | Self-service portal user | Portal dashboard, own payments, service requests, linked customer statement |
| `business_viewer` | Read-only business observer | Dashboard, reports, audit, business settings monitoring, bills, payments, production, payroll, contractor invoice views |

## Access Contexts

Users can have one or more access profiles. If more than one active profile exists, login returns a context selection step before issuing the final browser session.

Access contexts support cases such as:

- A director using a read-only business viewer profile.
- A user with separate administrative and customer-portal contexts.
- Customer users linked to more than one customer account through portal links.

The selected access profile controls the active role and optional customer scope in the signed session.

## Admin

Admin can:

- Manage users and roles.
- Create, update, and delete core operational records where supported.
- Manage business settings and logo.
- Review source billing requests.
- Promote held bills for payment.
- Review customer adjustments.
- Access operational backup reports.
- Record restore drill results and review backup readiness.
- Manage private knowledge base documents.
- View monitoring snapshots, event logs, and send monitoring test alerts.
- Preview and trigger operational reminders.
- Terminate payroll payees.
- Discard payment suspense items.
- Create and update user access contexts.

Admin is the final authority for high-risk changes.

## Accountant

Accountant can:

- Manage customers, rates, zones, bills, billing periods, payments, expenses, payroll, contractor invoices, communications, and reports.
- Import customers, readings, payments, and expenses where allowed.
- Apply and waive penalties.
- Create and update payroll runs and line items.
- Send invoice alerts and receipts.
- Manage private knowledge base documents.
- Preview and trigger operational reminders.
- View monitoring summaries and event logs.
- View audit events.
- Post approved contractor invoices to expenses.

Accountant cannot:

- Manage users.
- Access operational backup.
- Perform admin-only final review actions.
- Delete customers.

## Meter Reader

Meter reader can:

- View dashboard.
- View customers needed for field work.
- View rates and zones needed for reading context.
- List and create meter readings.
- View and manage meter replacement event workflow where allowed.
- Create and update maintenance requests.
- Record production weekly readings.
- Upload maintenance supporting documents.
- Access knowledge base documents shared with the `meter_reader` role.

Meter reader cannot:

- Access bills, payments, expenses, reports, payroll, communications, or backup.
- Access contractor invoice or expense document surfaces.
- Manage knowledge base documents.
- View monitoring, reminder logs, or backup drill records.
- Manage users or business settings.

## Customer

Customer can:

- Access `/api/portal/dashboard`.
- View own linked payment receipt details through the portal.
- Submit service requests.
- Generate linked customer statement where explicitly allowed.

Customer cannot:

- Access internal dashboard.
- Access internal customer, bill, reading, rate, zone, report, payroll, or communication registers.

## Business Viewer

Business viewer can:

- View dashboard.
- View reports and data-quality checks.
- View audit events.
- View bills and payments.
- View customers and customer statements.
- View business settings.
- View production meters, top-ups, weekly readings, reading context, and production report.
- View payroll payees and runs.
- View contractor records and contractor invoices.
- View knowledge base documents shared with the `business_viewer` role.
- View monitoring summaries and event logs.

Business viewer cannot:

- Create, edit, approve, delete, post, import, or send operational records.
- Manage users, business settings, billing periods, payments, payroll, production entries, or contractor invoices.
- Manage knowledge base documents, send reminders, record restore drills, or send monitoring test alerts.
- Access customer portal as a customer unless assigned a separate customer context.

## Permission Review Checklist

- Confirm every new route has both `authenticate` and `authorize` unless intentionally public.
- Confirm customer-facing data is scoped to the authenticated portal customer.
- Confirm admin-only review/promote/delete actions stay admin-only.
- Confirm meter readers can do field work without seeing finance registers.
- Confirm accountants can operate billing and collections without user-management access.
- Confirm business viewers can view reporting surfaces without mutation access.
- Confirm knowledge base documents are visible only to roles listed on each document.
- Confirm public status/docs pages do not expose authenticated operational data.
- Confirm cron routes require the correct secret.
- Confirm multi-context users receive the context selection flow at login.
