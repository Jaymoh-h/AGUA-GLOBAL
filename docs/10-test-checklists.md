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
- Multi-context user can switch workspace from the sidebar without logging out; the destination changes to the staff dashboard or customer portal as appropriate.
- A context switch refreshes visible navigation and rejects profiles not owned by the logged-in user or marked inactive.
- Confirm `auth.context_switched` appears in the audit trail with the previous and new profiles.
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
- Post a service charge for a customer.
- Confirm customer balance includes the service charge.
- Post a payment and confirm it can allocate to the service-charge-backed bill.

## Customer Service Charge Test

- Create a service charge as admin/accountant.
- Confirm a linked payable bill is created.
- Confirm the customer statement shows the service charge description.
- Confirm Bills and Reports show the linked bill with service-charge metadata.
- Confirm accountant reports show Customer Service Charges separately from water usage revenue.
- Waive an unpaid service charge with a reason.
- Cancel an unpaid service charge as admin with a reason.
- Confirm waived/cancelled charges no longer affect payable balance.
- Confirm service charge create/waive/cancel actions appear in the audit trail.

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
- Edit a production meter's display name, zone, tariff, notes, or operational status and confirm the history remains intact.
- For a customer-source production meter, rematch the exact linked source meter and confirm it must be an active source-backup meter for the same customer.
- Confirm meter number, type, and linked customer stay protected; use replacement when the physical production meter changes.
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
- Replace an active source-backup meter from Readings, confirm the new meter remains source-backup, and confirm active linked production meters are rematched.

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
- Enter an effective termination date and reason for an employee or recurring service provider.
- Confirm future run excludes terminated payee.

## Form Draft Test

- Enter data in a production meter, meter replacement, electricity top-up, payroll run, recurring payee, or period-payee form.
- Navigate to another page and return; confirm the unfinished form is restored for the same user and access context.
- Submit the form, or cancel an edit where available, and confirm its draft is cleared.
- Switch workspace and confirm drafts from the previous access context are not shown.

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
- Download an uploaded document after a fresh browser session to confirm PostgreSQL-backed persistence.
- Confirm a file larger than 3MB is rejected before upload.
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
- Confirm backup export includes core tables, customer service charges, reminder logs, monitoring logs, restore drills, and knowledge documents.
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
