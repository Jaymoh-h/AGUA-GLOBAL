# User Roles And Permissions

AGUA Global uses four primary roles:

- `admin`
- `accountant`
- `meter_reader`
- `customer`

Permissions are enforced mainly in route files under `server/src/routes/` using JWT authentication and role guards.

## Role Summary

| Role | Primary Purpose | Typical Access |
| --- | --- | --- |
| `admin` | System owner and operations controller | Full operational access, user management, high-risk approvals |
| `accountant` | Finance and billing operator | Customers, billing, payments, expenses, reports, payroll, communications |
| `meter_reader` | Field operations user | Customers, readings, meters, maintenance, production readings, dashboard |
| `customer` | Self-service portal user | Portal dashboard, own payments, service requests, linked customer statement |

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

Admin is the final authority for high-risk changes.

## Accountant

Accountant can:

- Manage customers, rates, zones, bills, billing periods, payments, expenses, payroll, communications, and reports.
- Import customers, readings, payments, and expenses where allowed.
- Apply and waive penalties.
- Create and update payroll runs and line items.
- Send invoice alerts and receipts.
- View audit events.

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

Meter reader cannot:

- Access bills, payments, expenses, reports, payroll, communications, or backup.
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

## Permission Review Checklist

- Confirm every new route has both `authenticate` and `authorize` unless intentionally public.
- Confirm customer-facing data is scoped to the authenticated portal customer.
- Confirm admin-only review/promote/delete actions stay admin-only.
- Confirm meter readers can do field work without seeing finance registers.
- Confirm accountants can operate billing and collections without user-management access.
