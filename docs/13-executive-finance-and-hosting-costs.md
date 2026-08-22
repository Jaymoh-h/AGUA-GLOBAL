# Executive Finance And Hosting Costs

This document summarizes the expected recurring platform costs for running AGUA Global in production.

Assumptions for executive presentation:

- USD to KSh exchange rate: `1 USD = KSh 130`.
- Expected SMS volume: `100 to 300 SMS per month`.
- Email remains on free Gmail.
- Domain renewal and protection services are separate registrar items from Host Africa.
- Google Workspace branded email may be considered as a later upgrade, but is not part of the current operating budget.
- SMS alerts should be limited to billing/service-critical messages to keep usage near 100 to 300 SMS per month.

## Cost Summary

| Item | Provider | Estimated Cost | Billing Cycle | Notes |
| --- | --- | ---: | --- | --- |
| Domain registration/renewal | Host Africa | KSh 2,350 | Yearly | Public domain managed by Host Africa. |
| Warranty and IP protection | Host Africa | KSh 1,000 | Yearly | Separate protection item from the same registrar. |
| Web app and API hosting | Vercel | USD 20 | Monthly | Hosts the React web app and Express API. |
| PostgreSQL database hosting | Neon | USD 15 | Monthly | Hosts the managed PostgreSQL production database. |
| Email | Gmail | Free | Monthly | Used for normal email service; paid Google Workspace can be added later if needed. |
| Virtual phone number lease | Twilio | USD 1.15 | Monthly | Leased Twilio number for messaging capability. |
| SMS sending | Twilio | USD 0.0045 to USD 0.0083 per SMS | Pay as you go | Cost scales with actual SMS volume sent. |

## Monthly Base Cost

Fixed monthly platform cost before SMS usage:

```text
Vercel hosting:          USD 20.00
Neon PostgreSQL:         USD 15.00
Twilio phone number:     USD  1.15
Email via Gmail:         USD  0.00
----------------------------------
Monthly fixed total:     USD 36.15
Monthly fixed total:     KSh 4,699.50 at KSh 130/USD
```

SMS is variable:

```text
Monthly SMS cost = number of SMS sent x USD 0.0045 to USD 0.0083
```

At 100 to 300 SMS per month:

```text
Low monthly SMS estimate:   100 x USD 0.0045 = USD 0.45 = KSh 58.50
High monthly SMS estimate:  300 x USD 0.0083 = USD 2.49 = KSh 323.70
```

Expected monthly operating range before spreading yearly registrar cost:

```text
KSh 4,699.50 + KSh 58.50  = KSh 4,758.00
KSh 4,699.50 + KSh 323.70 = KSh 5,023.20
```

If the yearly Host Africa cost is spread monthly:

```text
Host Africa yearly total: KSh 2,350 + KSh 1,000 = KSh 3,350
KSh 3,350 / 12 = KSh 279.17 per month

Expected monthly range with registrar cost spread:
KSh 5,037.17 to KSh 5,302.37
```

## Yearly Base Cost

Fixed yearly platform cost before SMS usage:

```text
Monthly fixed USD total:      USD 36.15 x 12 = USD 433.80
Monthly fixed KSh total:      KSh 56,394.00 at KSh 130/USD
Host Africa domain:           KSh 2,350 yearly
Host Africa warranty/IP:      KSh 1,000 yearly
Host Africa yearly total:     KSh 3,350 yearly
```

Expected yearly SMS range:

```text
Low SMS estimate:   USD 0.45 x 12 = USD 5.40  = KSh 702.00
High SMS estimate:  USD 2.49 x 12 = USD 29.88 = KSh 3,884.40
```

Expected yearly operating range:

```text
KSh 56,394.00 + KSh 3,350 + KSh 702.00   = KSh 60,446.00
KSh 56,394.00 + KSh 3,350 + KSh 3,884.40 = KSh 63,628.40
```

## SMS Usage Scenarios

| Monthly SMS Volume | Low Estimate At USD 0.0045 | High Estimate At USD 0.0083 |
| ---: | ---: | ---: |
| 100 SMS | USD 0.45 / KSh 58.50 | USD 0.83 / KSh 107.90 |
| 300 SMS | USD 1.35 / KSh 175.50 | USD 2.49 / KSh 323.70 |
| 1,000 SMS | USD 4.50 | USD 8.30 |
| 5,000 SMS | USD 22.50 | USD 41.50 |
| 10,000 SMS | USD 45.00 | USD 83.00 |
| 20,000 SMS | USD 90.00 | USD 166.00 |

## Financial Interpretation

The system has a low fixed operating cost. The core production infrastructure is approximately USD 36.15 per month before SMS usage, which is about KSh 4,699.50 at KSh 130/USD. With expected SMS usage and the Host Africa yearly cost spread across months, the expected monthly operating range is about KSh 5,037.17 to KSh 5,302.37.

This is cost-effective because one hosted system replaces scattered Excel workbooks, manual QuickBooks reconciliation, disconnected customer records, and informal communication tracking. The main cost that scales with usage is SMS, which can be controlled by deciding which alerts are mandatory and which can use email, WhatsApp, or in-app views.

## Comparison With Previous Operating Method

The previous operating model depended on manual books, Excel workbooks, and a QuickBooks/Excel combination. This worked for basic record keeping, but it created gaps between field operations, billing, collections, expenses, and management reporting.

| Area | Manual Books, Excel, And QuickBooks | AGUA Global |
| --- | --- | --- |
| Customer records | Customer details can be duplicated or become inconsistent across books and spreadsheets. | Customer accounts, rates, zones, deposits, meters, statements, and portal links are held in one database. |
| Meter readings | Readings are captured manually, then transferred into spreadsheets or billing files. | Readings are captured directly in the system and can generate or update bills. |
| Billing | Bills require manual calculation, workbook formulas, or separate accounting entries. | Bills are generated from rates, readings, billing periods, penalties, waivers, and review workflows. |
| Payments | Payments must be reconciled manually against bills and receipts. | Payments allocate to unpaid bills and update balances automatically. |
| Expenses | Expenses may sit in QuickBooks without a clear operational link. | Expenses can be linked to maintenance, production, payroll, contractor invoices, and operational categories. |
| Reports | Reports depend on who maintains the latest spreadsheet and how clean the data is. | Reports are generated from live operational and financial records. |
| Controls | Access is difficult to restrict once files are shared. | Role-based access separates admin, accountant, meter reader, customer, and business viewer permissions. |
| Auditability | Manual edits and spreadsheet changes are hard to trace. | Key actions are logged with user, time, entity, and reason where applicable. |
| Continuity | Knowledge can remain with one staff member or one developer. | Documentation, migration records, backups, restore drills, and handover procedures support continuity. |
| Management visibility | Oversight usually requires requesting files or reconciliations. | Business viewer access provides read-only visibility into dashboards, reports, audit, and operational records. |

## Cost Controls

- Use email for non-urgent messages where possible.
- Use SMS only for high-value alerts such as bills, overdue balances, service notices, and critical reminders.
- Keep SMS alerts limited so usage remains near 100 to 300 SMS per month.
- Monitor monthly SMS volume.
- Review Vercel and Neon usage monthly during the first three months after launch.
- Keep database backups and restore drills documented so hosting cost also supports operational resilience.

## Data Protection Measures

AGUA Global should use layered protection rather than relying on one tool.

- Role-based access: users only see the modules needed for their work.
- Customer scoping: customer portal users only access their linked customer records.
- Business viewer mode: executives and observers can review records without editing them.
- Audit trail: important changes are recorded with user, action, time, entity, and reason where applicable.
- HTTPS/TLS: production traffic should run through secure HTTPS endpoints.
- Environment variables: secrets such as database URLs, JWT secrets, cron secrets, and provider credentials are stored outside source code.
- Managed database hosting: Neon should be configured with backups and recovery options appropriate for production.
- Application backups: operational JSON exports should be taken and retained according to the backup policy.
- Restore drills: recovery should be practiced and recorded at least quarterly.
- Monitoring: public status checks, internal monitoring logs, and alert notifications help detect outages or application errors early.
- Least privilege for developers: developers receive only the access needed for the task and access is removed after handover.
- Documentation: deployment steps, environment variables, database schema, API endpoints, and SOPs are maintained in the project docs.

## Developer Handover Measures

When developers change hands, the project should be transferable without losing control of the business system.

- Keep the GitHub repository under the business owner's organization or account, not a personal developer account.
- Require all code changes to go through branches, pull requests, or at minimum documented commits.
- Maintain the `/docs` folder as the source of truth for architecture, deployment, backup/recovery, API endpoints, schema, tests, and user workflows.
- Keep a current environment variable inventory without exposing secret values.
- Rotate sensitive credentials during developer exit, including GitHub access, Vercel access, Neon access, Twilio access, Gmail/app passwords, JWT secrets, cron secrets, and database credentials where practical.
- Use role-based platform access on Vercel, Neon, Twilio, and GitHub.
- Keep database migrations in source control and apply them through the migration runner.
- Record production deployments, migration dates, and backup/restore drill results.
- Maintain an admin account controlled by the business owner.
- Require a handover checklist covering current branch, pending work, known bugs, deployment status, database status, provider accounts, and test results.
- Remove old developer accounts after handover is complete.

## Clarifications To Confirm Before Presentation

- Whether Google Workspace branded email should be budgeted in a future upgrade phase.
- Whether SMS should remain limited to billing and service-critical communication after launch.
