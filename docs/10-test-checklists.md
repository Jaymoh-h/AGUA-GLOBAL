# Test Checklists

Use these checklists before demos, production deployments, and major commits.

## Smoke Test

- API health endpoint returns `ok`.
- Public API status endpoint returns API and database status.
- Client loads.
- Public status page loads through `/status`.
- Public documentation page loads through `/docs`.
- Admin login works.
- Dashboard loads without API errors.
- Customers page loads.
- Bills page loads.
- Payments page loads.
- Reports page loads.
- Knowledge Base page loads for an internal role.
- Customer portal login works.

## Role-Based Access Test

- Admin can access dashboard, users, customers, bills, payments, reports, settings, payroll, production, communications, backup, monitoring, restore drills, reminders, and knowledge base management.
- Accountant can access finance and operations pages, reminders, monitoring summaries, and knowledge base management but not user management or operational backup.
- Meter reader can access dashboard, customers, rates, zones, readings, meters, maintenance, production reading pages, and shared knowledge documents.
- Meter reader cannot access payments, reports, payroll, communications, or backup.
- Customer can access portal only.
- Customer cannot access internal `/api/dashboard`, `/api/customers`, `/api/bills`, `/api/rates`, or `/api/readings`.
- Business viewer can view dashboard, reports, audit, monitoring summaries, bills, payments, production, payroll, contractor invoice summaries, and shared knowledge documents.
- Business viewer cannot create, update, approve, post, delete, import, or send records.
- Multi-context user is prompted to select an access context after login.
- Cron routes reject requests without the configured secret.

## Customer Setup Test

- Create rate.
- Create zone.
- Create customer with unique account number.
- Confirm duplicate account number is rejected.
- Assign deposit state.
- Confirm customer appears in reading dropdown/context.

## Meter Reading And Billing Test

- Add first reading.
- Add second reading.
- Confirm units used are correct.
- Confirm bill is generated.
- Confirm dashboard values update.
- Edit a reading.
- Confirm affected bill recalculates.
- Try duplicate same-day reading.
- Confirm validation message is clear.

## Payment Test

- Select customer with unpaid bills.
- Confirm unpaid balance is visible.
- Post partial payment.
- Confirm bill becomes `partial`.
- Post remaining payment.
- Confirm bill becomes `paid`.
- Post one payment across multiple unpaid bills.
- Edit payment.
- Void payment to suspense.
- Reapply suspense.
- Discard suspense as admin.

## Billing Period And Penalty Test

- Create billing period.
- Confirm readings link to period.
- Preview penalties.
- Apply penalties.
- Waive penalty.
- Reapply penalty.
- Close period.
- Test correction with audit reason.
- Lock period and confirm stricter correction behavior.

## Source Billing Test

- Enter source-side reading before client reading.
- Confirm source request is pending or reviewable, not automatically payable.
- Approve source request.
- Confirm bill is held.
- Promote source bill as admin.
- Confirm payable register updates.

## Production Test

- Create production source meter.
- Add weekly production reading.
- Add electricity top-up.
- Confirm linked expense is created.
- Confirm production dashboard compares revenue and electricity cost.
- Confirm selected week loads previous prepaid kWh balance and previous meter readings.
- Confirm production report shows previous and current readings.
- Confirm full production print separates weekly summary blocks from meter detail rows.
- Confirm weekly summary print remains summary-only.
- Replace production meter.
- Confirm event history remains visible.

## Payroll Test

- Create recurring employee or subscription.
- Create payroll run.
- Confirm recurring payees appear.
- Add casual or contractor to specific run.
- Submit run.
- Approve run.
- Mark run paid.
- Confirm expenses are posted.
- Terminate recurring payee as admin.
- Confirm future run excludes terminated payee.

## Contractor Invoice Test

- Create contractor.
- Create draft invoice.
- Attach supporting document.
- Submit invoice.
- Approve invoice.
- Post approved invoice to expense.
- Confirm linked expense is created.
- Confirm posted or paid invoice cannot be edited.
- Confirm contractor payables reports show open, overdue, and posted amounts.

## Supporting Documents Test

- Upload document to maintenance request as meter reader.
- Upload document to expense as accountant.
- Upload document to contractor invoice as accountant.
- Download each document.
- Soft-delete a document.
- Confirm deleted document no longer appears in active list.

## Knowledge Base Test

- Upload a document as admin or accountant.
- Set category, sensitivity, version label, summary, and allowed roles.
- Confirm admin/accountant can edit document metadata.
- Confirm a permitted meter reader or business viewer can see and download the document.
- Confirm a role not listed in allowed roles cannot see or download the document.
- Download the document and confirm the audit trail records the download.
- Archive or delete the document and confirm it no longer appears in active results.

## Communications Test

- Configure provider credentials in environment.
- Preview invoice alerts.
- Send one email alert.
- Send one SMS alert.
- Send one WhatsApp alert.
- Create named bulk campaign.
- Confirm campaign history records recipients.
- Save reusable template.
- Configure approved WhatsApp template metadata.
- Confirm failed sends are logged clearly.

## Operational Reminder Test

- Configure `REMINDER_CRON_SECRET`.
- Preview pending operational reminders as admin/accountant.
- Send a manual reminder batch for one type.
- Confirm email delivery result is recorded in reminder logs.
- Run the operations cron path with the secret.
- Run the readings cron path with the secret.
- Confirm duplicate reminder keys are not resent inside the same due window.
- Confirm reminder logs are included in operational backup export.

## Monitoring And Public Status Test

- Confirm `/api/status` returns `ok` when the API and database are reachable.
- Stop or point the database to an invalid URL in a safe test environment and confirm `/api/status` reports database failure.
- Trigger a client-side error report from an authenticated page.
- Confirm the error appears in monitoring events.
- Confirm monitoring summary shows API errors, database failures, failed logins, and client events.
- Send a monitoring test alert as admin.
- Run `/api/monitoring/cron` with the configured secret.
- Confirm cooldown prevents repeated alert sends inside the configured window.
- Confirm public status page refreshes without requiring login.

## Backup, Restore Drill, And Migration Test

- Run migration status and confirm no unapplied migrations remain.
- Run the operational backup script.
- Confirm backup export includes core tables, reminder logs, monitoring logs, restore drills, and knowledge documents.
- Record a restore drill with backup reference, target environment, duration, dataset count, findings, and follow-up actions.
- Confirm backup status shows latest drill and next quarterly due date.
- Run backup retention pruning in a safe test backup directory.

## Print Settings Test

- Update business print/PDF defaults.
- Confirm page size, orientation, margin, scale, and fit-to-page values persist.
- Print or export a wide report and confirm compression settings keep columns readable.

## Deployment Acceptance Test

- API project env vars are set.
- Client project env vars are set.
- `CLIENT_ORIGIN` includes client, docs, and status origins where those hostnames are used.
- `VITE_API_URL` matches API URL.
- Production DB has latest migrations.
- Vercel Cron paths are configured for reminders and monitoring.
- Cron secrets are set and different from user passwords.
- Admin password has been changed.
- Backup has been taken after deployment.
- First restore drill has been scheduled or recorded.
