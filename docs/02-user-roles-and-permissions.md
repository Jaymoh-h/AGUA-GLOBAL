# User Roles And Permissions

AGUA Global uses five primary roles:

- `admin`
- `accountant`
- `meter_reader`
- `customer`
- `business_viewer`

Permissions are enforced mainly in route files under `server/src/routes/` using JWT authentication and role guards.

## Role Summary

| Role | Primary Purpose | Typical Access |
| --- | --- | --- |
| `admin` | System owner and operations controller | Full operational access, user management, high-risk approvals |
| `accountant` | Finance and billing operator | Customers, billing, payments, expenses, reports, payroll, communications |
| `meter_reader` | Field operations user | Customers, readings, meters, maintenance, production readings, dashboard |
| `customer` | Self-service portal user | Portal dashboard, own payments, service requests, linked customer statement |
| `business_viewer` | Read-only business observer | Dashboard, reports, audit, bills, payments, production, payroll, contractor invoice views |

## Access Contexts

Users can have one or more access profiles. If more than one active profile exists, login returns a context selection step before issuing the final operating token.

Access contexts support cases such as:

- A director using a read-only business viewer profile.
- A user with separate administrative and customer-portal contexts.
- Customer users linked to more than one customer account through portal links.

The selected access profile controls the active role and optional customer scope in the JWT.

## Admin

Admin can:

- Manage users and roles.
- Create, update, and delete core operational records where supported.
- Manage business settings and logo.
- Review source billing requests.
- Promote held bills for payment.
- Review customer adjustments.
- Access operational backup reports.
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

Meter reader cannot:

- Access bills, payments, expenses, reports, payroll, communications, or backup.
- Access contractor invoice or expense document surfaces.
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

Business viewer cannot:

- Create, edit, approve, delete, post, import, or send operational records.
- Manage users, business settings, billing periods, payments, payroll, production entries, or contractor invoices.
- Access customer portal as a customer unless assigned a separate customer context.

## Permission Review Checklist

- Confirm every new route has both `authenticate` and `authorize` unless intentionally public.
- Confirm customer-facing data is scoped to the authenticated portal customer.
- Confirm admin-only review/promote/delete actions stay admin-only.
- Confirm meter readers can do field work without seeing finance registers.
- Confirm accountants can operate billing and collections without user-management access.
- Confirm business viewers can view reporting surfaces without mutation access.
- Confirm multi-context users receive the context selection flow at login.
