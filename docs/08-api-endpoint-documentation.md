# API Endpoint Documentation

Base URL:

```text
http://localhost:5000/api
```

Production base URL:

```text
https://<api-project>.vercel.app/api
```

Most endpoints require a JWT bearer token:

```text
Authorization: Bearer <token>
```

## Health

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | API health check |
| `GET` | `/status` | Public | API and database status check |

## Authentication

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Public | Login and receive token |
| `POST` | `/auth/select-context` | Public with context token | Select an access context after login |
| `POST` | `/auth/password-reset/request` | Public | Request password reset |
| `POST` | `/auth/password-reset/confirm` | Public | Confirm password reset |
| `GET` | `/auth/me` | Authenticated | Current user profile |
| `POST` | `/auth/change-password` | Authenticated | Change own password |

## Customers

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/customers` | admin, accountant, meter_reader, business_viewer | List customers |
| `GET` | `/customers/:id` | admin, accountant, meter_reader, business_viewer | Get customer |
| `GET` | `/customers/:id/statement` | admin, accountant, customer, business_viewer | Customer statement |
| `POST` | `/customers` | admin, accountant | Create customer |
| `PUT` | `/customers/:id` | admin, accountant | Update customer |
| `DELETE` | `/customers/:id` | admin | Delete customer |
| `POST` | `/customers/:id/close` | admin, accountant | Close account |
| `POST` | `/customers/imports/preview` | admin, accountant | Preview customer import |
| `POST` | `/customers/imports/commit` | admin, accountant | Commit customer import |
| `POST` | `/customers/opening-balances/imports/preview` | admin, accountant | Preview opening balances |
| `POST` | `/customers/opening-balances/imports/commit` | admin, accountant | Commit opening balances |

## Rates And Zones

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/rates` | admin, accountant, meter_reader | List rates |
| `POST` | `/rates` | admin, accountant | Create rate |
| `PUT` | `/rates/:id` | admin, accountant | Update rate |
| `PUT` | `/rates/:id/blocks` | admin, accountant | Replace tariff blocks |
| `GET` | `/zones` | admin, accountant, meter_reader | List zones |
| `POST` | `/zones` | admin, accountant | Create zone |
| `PUT` | `/zones/:id` | admin, accountant | Update zone |

## Readings And Meters

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/readings` | admin, accountant, meter_reader | List readings |
| `POST` | `/readings` | admin, accountant, meter_reader | Create reading |
| `PUT` | `/readings/:id` | admin, accountant, meter_reader | Edit reading |
| `GET` | `/readings/context` | admin, accountant, meter_reader | Previous reading context |
| `GET` | `/readings/eligible-customers` | admin, accountant, meter_reader | Customers ready for readings |
| `POST` | `/readings/imports/preview` | admin, accountant, meter_reader | Preview reading import |
| `POST` | `/readings/imports/commit` | admin, accountant, meter_reader | Commit reading import |
| `GET` | `/meters` | admin, accountant, meter_reader | List meters |
| `GET` | `/meters/events` | admin, accountant, meter_reader | List meter events |
| `POST` | `/meters` | admin, accountant | Create meter |
| `POST` | `/meters/replace` | admin, accountant, meter_reader | Replace meter |
| `PUT` | `/meters/events/:id` | admin, accountant, meter_reader | Update meter event |

## Billing And Bills

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/bills` | admin, accountant, business_viewer | List bills |
| `GET` | `/bills/:id` | admin, accountant, business_viewer | Get bill |
| `PATCH` | `/bills/:id/status` | admin, accountant | Mark bill status |
| `PATCH` | `/bills/:id/promote` | admin | Promote held bill |
| `POST` | `/bills/:id/email` | admin, accountant | Email bill |
| `POST` | `/bills/:id/sms` | admin, accountant | SMS bill |
| `GET` | `/billing/periods` | admin, accountant | List periods |
| `POST` | `/billing/periods` | admin, accountant | Create period |
| `GET` | `/billing/periods/:id/readiness` | admin, accountant | Period readiness |
| `PATCH` | `/billing/periods/:id/status` | admin, accountant | Update period status |
| `GET` | `/billing/settings` | admin, accountant | Get settings |
| `PUT` | `/billing/settings` | admin, accountant | Update settings |
| `GET` | `/billing/source-billing-requests` | admin, accountant | List source review requests |
| `PATCH` | `/billing/source-billing-requests/:id/review` | admin | Review source request |
| `GET` | `/billing/penalties` | admin, accountant | List penalties |
| `GET` | `/billing/penalties/preview` | admin, accountant | Preview penalties |
| `POST` | `/billing/penalties/apply` | admin, accountant | Apply penalties |
| `PATCH` | `/billing/penalties/:id/waive` | admin, accountant | Waive penalty |
| `PATCH` | `/billing/penalties/:id/reapply` | admin, accountant | Reapply penalty |

## Payments

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/payments` | admin, accountant, business_viewer | List payments |
| `GET` | `/payments/:id` | admin, accountant, business_viewer | Get payment |
| `POST` | `/payments` | admin, accountant | Create payment |
| `PUT` | `/payments/:id` | admin, accountant | Edit payment |
| `POST` | `/payments/:id/void` | admin, accountant | Void to suspense |
| `GET` | `/payments/suspense` | admin, accountant, business_viewer | List suspense |
| `POST` | `/payments/suspense/:id/reapply` | admin, accountant | Reapply suspense |
| `POST` | `/payments/suspense/:id/discard` | admin | Discard suspense |
| `POST` | `/payments/imports/preview` | admin, accountant | Preview payment import |
| `POST` | `/payments/imports/commit` | admin, accountant | Commit payment import |
| `POST` | `/payments/:id/email` | admin, accountant | Email receipt |
| `POST` | `/payments/:id/sms` | admin, accountant | SMS receipt |

## Operations

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | admin, accountant, meter_reader, business_viewer | Dashboard data |
| `GET` | `/expenses` | admin, accountant, business_viewer | List expenses |
| `POST` | `/expenses` | admin, accountant | Create expense |
| `POST` | `/expenses/imports/preview` | admin, accountant | Preview expense import |
| `POST` | `/expenses/imports/commit` | admin, accountant | Commit expense import |
| `GET` | `/maintenance-requests` | admin, accountant, meter_reader | List requests |
| `POST` | `/maintenance-requests` | admin, accountant, meter_reader | Create request |
| `PUT` | `/maintenance-requests/:id` | admin, accountant, meter_reader | Update request |
| `PATCH` | `/maintenance-requests/:id/resolve` | admin, accountant, meter_reader | Resolve request |
| `POST` | `/maintenance-requests/:id/expenses` | admin, accountant, meter_reader | Create linked expense |

## Reports, Audit, And Settings

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/reports/summary` | admin, accountant, business_viewer | Report summary |
| `GET` | `/reports/accountant` | admin, accountant, business_viewer | Accountant reports |
| `GET` | `/reports/data-quality` | admin, accountant, business_viewer | Data quality checks |
| `GET` | `/reports/backup-status` | admin | Backup manifest, retention policy, and export readiness |
| `GET` | `/reports/backup-restore-drills` | admin | Restore drill history |
| `POST` | `/reports/backup-restore-drills` | admin | Record backup restore drill result |
| `GET` | `/reports/backup` | admin | Operational backup |
| `GET` | `/audit-events` | admin, accountant, business_viewer | Audit event list |
| `GET` | `/monitoring/summary` | admin, accountant, business_viewer | Application monitoring summary and recent events |
| `GET` | `/monitoring/events` | admin, accountant, business_viewer | Recent application monitoring events |
| `GET` | `/monitoring/alert-snapshot` | admin | Current monitoring alert evaluation window |
| `POST` | `/monitoring/test-alert` | admin | Force a monitoring alert delivery test |
| `GET` | `/monitoring/cron` | Secret protected | Scheduled monitoring alert runner |
| `POST` | `/monitoring/client-events` | Authenticated | Record client-side page/runtime errors |
| `GET` | `/business-settings/public` | Public | Public business profile |
| `GET` | `/business-settings` | admin, accountant, business_viewer | Business settings |
| `PUT` | `/business-settings` | admin | Update settings |
| `POST` | `/business-settings/logo` | admin | Upload logo |
| `GET` | `/reminders/operational/preview` | admin, accountant | Preview operational reminders |
| `POST` | `/reminders/operational/send` | admin, accountant | Send due operational reminder emails; accepts optional `types` |
| `GET` | `/reminders/operational/logs` | admin, accountant | List recent operational reminder logs |
| `GET` | `/reminders/operational/cron` | Secret protected | Scheduled operational reminder run; accepts optional `types` |
| `GET` | `/reminders/operational/cron/operations` | Secret protected | Scheduled morning operational reminder run |
| `GET` | `/reminders/operational/cron/readings` | Secret protected | Scheduled midday readings reminder run |
| `GET` | `/users` | admin | List users |
| `POST` | `/users` | admin | Create user |
| `PUT` | `/users/:id` | admin | Update user |
| `POST` | `/users/:id/access-profiles` | admin | Create user access context |
| `PATCH` | `/users/:id/access-profiles/:profileId` | admin | Update user access context |

## Production

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/production/meters` | admin, accountant, meter_reader, business_viewer | List production meters |
| `POST` | `/production/meters` | admin, accountant | Create production meter |
| `POST` | `/production/meters/:id/replace` | admin, accountant | Replace production meter |
| `GET` | `/production/electricity-topups` | admin, accountant, meter_reader, business_viewer | List top-ups |
| `POST` | `/production/electricity-topups` | admin, accountant | Create top-up and expense |
| `GET` | `/production/weekly-readings` | admin, accountant, meter_reader, business_viewer | List weekly readings |
| `GET` | `/production/reading-context` | admin, accountant, meter_reader, business_viewer | Previous kWh and meter-reading context |
| `POST` | `/production/weekly-readings` | admin, accountant, meter_reader | Create weekly reading |
| `GET` | `/production/weekly-readings/:id` | admin, accountant, meter_reader, business_viewer | Get weekly reading |
| `PUT` | `/production/weekly-readings/:id` | admin, accountant, meter_reader | Update weekly reading |
| `DELETE` | `/production/weekly-readings/:id` | admin, accountant | Delete weekly reading |
| `GET` | `/production/report` | admin, accountant, meter_reader, business_viewer | Production report |

## Payroll

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/payroll/payees` | admin, accountant, business_viewer | List payees |
| `POST` | `/payroll/payees` | admin, accountant | Create payee |
| `PATCH` | `/payroll/payees/:id/terminate` | admin | Terminate payee |
| `GET` | `/payroll/runs` | admin, accountant, business_viewer | List runs |
| `POST` | `/payroll/runs` | admin, accountant | Create run |
| `GET` | `/payroll/runs/:id` | admin, accountant, business_viewer | Get run |
| `POST` | `/payroll/runs/:id/line-items` | admin, accountant | Add period line item |
| `PATCH` | `/payroll/runs/:id/status` | admin, accountant | Update run status |
| `GET` | `/payroll/line-items/:lineId/payslip` | admin, accountant, business_viewer | Download payslip PDF |
| `PATCH` | `/payroll/line-items/:lineId` | admin, accountant | Update line item |

## Communications And Portal

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/communications/invoice-preview` | admin, accountant | Invoice alert preview |
| `GET` | `/communications/templates` | admin, accountant | List templates |
| `POST` | `/communications/templates` | admin, accountant | Create template |
| `PUT` | `/communications/templates/:id` | admin, accountant | Update template |
| `GET` | `/communications/campaigns` | admin, accountant | List campaigns |
| `GET` | `/communications/campaigns/:id` | admin, accountant | Campaign details |
| `POST` | `/communications/invoice-alerts/:customerId/send` | admin, accountant | Send one invoice alert |
| `POST` | `/communications/invoice-alerts/bulk-send` | admin, accountant | Send bulk alerts |
| `GET` | `/portal/dashboard` | customer | Portal dashboard |
| `GET` | `/portal/payments/:id` | customer | Portal receipt/payment |
| `POST` | `/portal/service-requests` | customer | Create portal service request |

## Documents

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/documents?entity_type=&entity_id=` | admin, accountant, meter_reader | List supporting documents |
| `POST` | `/documents` | admin, accountant, meter_reader | Upload supporting document |
| `GET` | `/documents/:id/download` | admin, accountant, meter_reader | Download supporting document |
| `DELETE` | `/documents/:id` | admin, accountant, meter_reader | Soft-delete supporting document |
| `GET` | `/knowledge-documents` | admin, accountant, meter_reader, business_viewer | List visible knowledge documents |
| `POST` | `/knowledge-documents` | admin, accountant | Upload private SOP/manual document |
| `PUT` | `/knowledge-documents/:id` | admin, accountant | Update metadata/access |
| `GET` | `/knowledge-documents/:id/download` | admin, accountant, meter_reader, business_viewer | Download and audit access |
| `DELETE` | `/knowledge-documents/:id` | admin, accountant | Archive private document |

Documents can currently link to maintenance requests, expenses, and contractor invoices. Expense and contractor invoice documents are restricted to admin/accountant by controller-level checks.

Knowledge documents are separate from public `/docs`. Admins can see and manage all records; non-admin staff can only see active records whose `allowed_roles` includes their current access role. Restricted knowledge documents are admin-managed.

## Contractor Invoices

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/contractor-invoices/contractors` | admin, accountant, business_viewer | List contractors |
| `POST` | `/contractor-invoices/contractors` | admin, accountant | Create contractor |
| `PUT` | `/contractor-invoices/contractors/:id` | admin, accountant | Update contractor |
| `GET` | `/contractor-invoices/invoices` | admin, accountant, business_viewer | List contractor invoices |
| `POST` | `/contractor-invoices/invoices` | admin, accountant | Create contractor invoice |
| `PUT` | `/contractor-invoices/invoices/:id` | admin, accountant | Update contractor invoice |
| `PATCH` | `/contractor-invoices/invoices/:id/status` | admin, accountant | Submit, approve, or reject invoice |
| `POST` | `/contractor-invoices/invoices/:id/post-expense` | admin, accountant | Post approved invoice to expense |
