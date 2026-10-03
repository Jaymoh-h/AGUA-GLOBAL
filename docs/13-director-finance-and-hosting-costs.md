# Director Finance And Hosting Costs

This document summarizes the expected recurring platform costs for running AGUA Global in production.

Assumptions for director presentation:

- USD to KSh exchange rate: `1 USD = KSh 130`.
- Expected SMS volume: `100 to 300 SMS per month`.
- Email remains on free Gmail.
- Domain and protection services are separate registrar items from Host Africa, with a combined yearly planning estimate of KSh 2,000 until the final invoice split is confirmed.

## Cost Summary

| Item | Provider | Estimated Cost | Billing Cycle | Notes |
| --- | --- | ---: | --- | --- |
| Domain registration/renewal | Host Africa | Part of KSh 2,000 | Yearly | Public domain managed by Host Africa. Exact split to confirm from invoice. |
| Warranty and IP protection | Host Africa | Part of KSh 2,000 | Yearly | Separate protection item from the same registrar. Exact split to confirm from invoice. |
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
KSh 2,000 / 12 = KSh 166.67 per month

Expected monthly range with registrar cost spread:
KSh 4,924.67 to KSh 5,189.87
```

## Yearly Base Cost

Fixed yearly platform cost before SMS usage:

```text
Monthly fixed USD total:      USD 36.15 x 12 = USD 433.80
Monthly fixed KSh total:      KSh 56,394.00 at KSh 130/USD
Host Africa domain:           Part of KSh 2,000 yearly
Host Africa warranty/IP:      Part of KSh 2,000 yearly
Host Africa yearly total:     KSh 2,000 yearly
```

Expected yearly SMS range:

```text
Low SMS estimate:   USD 0.45 x 12 = USD 5.40  = KSh 702.00
High SMS estimate:  USD 2.49 x 12 = USD 29.88 = KSh 3,884.40
```

Expected yearly operating range:

```text
KSh 56,394.00 + KSh 2,000 + KSh 702.00   = KSh 59,096.00
KSh 56,394.00 + KSh 2,000 + KSh 3,884.40 = KSh 62,278.40
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

## Director-Level Interpretation

The system has a low fixed operating cost. The core production infrastructure is approximately USD 36.15 per month before SMS usage, which is about KSh 4,699.50 at KSh 130/USD. With expected SMS usage and the Host Africa yearly cost spread across months, the expected monthly operating range is about KSh 4,924.67 to KSh 5,189.87.

This is cost-effective because one hosted system replaces scattered Excel workbooks, manual QuickBooks reconciliation, disconnected customer records, and informal communication tracking. The main cost that scales with usage is SMS, which can be controlled by deciding which alerts are mandatory and which can use email, WhatsApp, or in-app views.

## Cost Controls

- Use email for non-urgent messages where possible.
- Use SMS only for high-value alerts such as bills, overdue balances, service notices, and critical reminders.
- Monitor monthly SMS volume.
- Review Vercel and Neon usage monthly during the first three months after launch.
- Keep database backups and restore drills documented so hosting cost also supports operational resilience.

## Data Protection Measures

AGUA Global should use layered protection rather than relying on one tool.

- Role-based access: users only see the modules needed for their work.
- Customer scoping: customer portal users only access their linked customer records.
- Business viewer mode: directors and observers can review records without editing them.
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

- Exact Host Africa invoice split between domain renewal and warranty/IP protection.
- Whether paid Google Workspace branded email should remain a future upgrade or be included in a later budget.
- Whether SMS alerts should be limited to billing/service-critical messages to keep monthly usage near 100 to 300 SMS.
