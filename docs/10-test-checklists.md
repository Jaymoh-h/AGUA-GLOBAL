# Test Checklists

Use these checklists before demos, production deployments, and major commits.

## Smoke Test

- API health endpoint returns `ok`.
- Client loads.
- Admin login works.
- Dashboard loads without API errors.
- Customers page loads.
- Bills page loads.
- Payments page loads.
- Reports page loads.
- Customer portal login works.

## Role-Based Access Test

- Admin can access dashboard, users, customers, bills, payments, reports, settings, payroll, production, communications, and backup.
- Accountant can access finance and operations pages but not user management or backup.
- Meter reader can access dashboard, customers, rates, zones, readings, meters, maintenance, and production reading pages.
- Meter reader cannot access payments, reports, payroll, communications, or backup.
- Customer can access portal only.
- Customer cannot access internal `/api/dashboard`, `/api/customers`, `/api/bills`, `/api/rates`, or `/api/readings`.
- Business viewer can view dashboard, reports, audit, bills, payments, production, payroll, and contractor invoice summaries.
- Business viewer cannot create, update, approve, post, delete, import, or send records.
- Multi-context user is prompted to select an access context after login.

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

## Deployment Acceptance Test

- API project env vars are set.
- Client project env vars are set.
- `CLIENT_ORIGIN` matches client URL.
- `VITE_API_URL` matches API URL.
- Production DB has latest migrations.
- Admin password has been changed.
- Backup has been taken after deployment.
