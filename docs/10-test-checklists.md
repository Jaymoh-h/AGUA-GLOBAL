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
- Exceed a low disposable rate-limit threshold and confirm the API returns `429` with `Retry-After` rather than a server error.

## Development Scenario Data

- Run `npm.cmd run db:seed:scenarios` from `server` after the baseline seed and migrations are current. The command is idempotent and refuses production environments.
- Confirm the labelled `DEV-*` dataset includes overdue, partial, paid, held, source-review, missing-reading, unallocated-credit, suspense, adjustment, connection-request, payment-plan, billing-dispute, maintenance-expense, contractor-invoice, payroll, and production/top-up states.
- Re-run the command after exploratory changes to restore the intended development scenario values. It never resets the database or deletes unrelated records.

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
- Open Batch Reading Sheet and load customers missing readings for the selected month.
- Confirm each row shows account, customer, selected meter, prior-period reading, and editable current reading.
- Confirm accounts with multiple active client-billing meters require the single-entry flow.
- Enter readings with `Enter`, arrow keys, and `Tab`; confirm focus advances without changing values.
- Confirm blank rows are excluded and zero remains a valid entered value.
- Enter a value below the previous reading and confirm preview is blocked with an inline explanation.
- Preview valid rows and confirm expected bill count before import is enabled.
- Reload the page and confirm the current user/workspace draft is restored.
- Confirm one invalid or stale server row prevents the entire batch from committing.
- Import a valid disposable batch and confirm readings, bills, usage, and audit records are correct.
- Open Reading Anomalies for a period with a known outlier and confirm only client-billing readings with three prior intervals and more than 50 percent variance appear.
- Select Review reading and confirm the existing edit form is populated without changing a reading, bill, or billing period until Save reading is explicitly confirmed.
- Open Estimated Reading Candidates and confirm suggestions require exactly three earlier usage intervals and no reading for the selected meter in the selected period.
- Confirm opening the candidate list never creates a reading, bill, audit event, or billing period; verify field values through the normal reading workflow before entry.

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
- Confirm the Recently Corrected timeline includes corrected, voided, reapplied, and discarded payment actions.
- Confirm each timeline row shows receipt, amount, reason, actor, and time, and opens the applicable receipt.
- Confirm reapplied events open the replacement receipt rather than the superseded receipt.
- Confirm admin, accountant, and business viewer roles can read `GET /api/payments/corrections?limit=N`.
- Confirm the corrections API caps `limit` at 50 and never exposes raw `before_data` or `after_data`.
- Open incoming-payment reconciliation and confirm the Source, Map columns, Match customers, and Validate & import stages advance in order.
- Leave incoming-payment reconciliation and return in the same user workspace; confirm the in-progress statement, mapping, matches, selected source, and stage resume.
- Confirm an exact account/phone match can preselect, but name-only and ambiguous matches remain unselected for operator review.
- Preview a bank or M-Pesa import with a missing transaction reference and confirm it is rejected without posting.
- Preview M-Pesa rows marked pending, reversed, or failed and confirm they are rejected; completed/successful rows may proceed to the normal duplicate and customer-match checks.
- With the guarded M-Pesa callback pilot enabled in a non-production environment, submit a valid disposable confirmation and confirm one receipt plus a `posted` callback-control event. Replay it and confirm no second receipt plus a `duplicate` event. Submit a valid-token confirmation with an invalid account or shortcode and confirm no receipt, no suspense item, and a `rejected` callback-control event.
- Preview repeated transaction references in one file and references already used by posted payments; confirm commit is blocked without partial writes.
- Complete a valid preview and confirm import remains disabled until every row is valid.
- Start a valid payment import and confirm the final review shows the number of payments, amount, and source; cancel it and confirm no receipt is posted.
- Post a disposable valid batch and confirm Recent Payment Imports shows the batch reference, source, count, total, channel split, fingerprint, and actor without exposing CSV contents.
- Post a service charge for a customer.
- Confirm customer balance includes the service charge.
- Post a payment and confirm it can allocate to the service-charge-backed bill.

## Customer Service Charge Test

- Prepare a service charge as admin/accountant and open its final review.
- Confirm customer, charge type, amount, dates, description, linked payable-bill consequence, and no-payment/no-notification consequence before posting.
- Confirm the finance approval note is required; cancelling leaves both the charge and payable bill uncreated.
- Confirm a linked payable bill is created.
- Confirm the customer statement shows the service charge description.
- Confirm Bills and Reports show the linked bill with service-charge metadata.
- Confirm accountant reports show Customer Service Charges separately from water usage revenue.
- Waive an unpaid service charge with a reason.
- Cancel an unpaid service charge as admin with a reason.
- Confirm waived/cancelled charges no longer affect payable balance.
- Confirm service charge create/waive/cancel actions appear in the audit trail.

## Customer Account Closure Test

- Prepare a customer closure and open the final settlement review.
- Confirm the customer, settlement date, amount due, paid deposit, allocation, remainder outcome, inactive-service consequence, and zero-value closure bill before confirming.
- Confirm the closure approval note is required. Cancelling must leave the customer active and create no closure bill, deposit allocation, refund expense, transfer receipt, or audit record.
- Where a deposit remainder is refunded or transferred, confirm the resulting manual-adjustment record is an accounting entry only and does not claim a bank, cash, or M-Pesa transfer has been initiated.

## Customer Account Setup Test

- Prepare a new customer account and open the setup review before confirming.
- Confirm the customer, zone, tariff, deposit state, opening balance, migration-bill consequence, and no-payment/no-notification consequence are correct.
- Confirm an account-setup approval note is required; cancelling leaves no customer, migration bill, or audit event.
- Edit only customer contact or delivery settings and confirm the change can save directly.
- Edit a tariff, deposit, or opening balance and confirm the financial account-change review and approval note are required. Cancelling retains the original account and migration bill.
- Prepare permanent customer deletion and confirm the review identifies the customer, balance, history-preserving account-closure alternative, and linked-record restriction. Confirm the deletion approval note is required and cancelling makes no change.
- Preview valid customer and opening-balance CSV batches, then confirm their final review shows valid/invalid counts, opening-balance total, migration-bill consequence, and no-payment/no-notification consequence. Both commits require an import approval note; cancelling leaves the preview and database unchanged.

## Payment Allocation Review Test

- Prepare a receipt for an account with an outstanding balance and confirm the final review fixes the customer, amount due before posting, receipt amount, allocation to due, credit remainder, channel, date, and reference. Cancelling must not create a receipt, allocation, or audit event.
- Prepare an overpayment and confirm the review identifies the amount that will remain as customer credit before posting.
- Edit an existing receipt and confirm the final review displays the correction reason. Cancelling must retain the original receipt and allocation; saving must preserve the existing correction audit behavior.

## Manual Adjustment Review Test

- Open a pending credit and debit adjustment as an administrator. Confirm the review identifies the customer, type, amount, date, requested reason, and financial effect: credit approval creates an adjustment receipt under normal allocation rules; debit approval creates a debit bill only.
- Confirm approval and rejection both require a review note. Cancelling leaves the request pending and does not create a receipt, bill, allocation, or balance change. Verify the API rejects an empty review note as well.

## Guided Billing Cycle Control-Surface Test

Use a disposable open period with at least one normal client-meter reading, one reading exception, one source-billing exception, and one invoice delivery exception where the environment supports them.

- Open the Billing Cycle control surface and select the intended open period; confirm its dates, due date, status, and readiness figures match the selected period.
- Confirm the selected-period snapshot shows reading completion and the 95% bill-preparation recommendation. A period below the target must remain visibly behind; reaching the target must not auto-issue bills, send invoices, or close the period.
- Switch to a different open period, then back again; confirm the queues and counts are scoped to the selected period and no records from the other period appear in the decision flow.
- Confirm a closed or locked period can be reviewed but cannot be selected for new reading capture or bill-issue work.
- Enter or import a valid client-meter reading for the selected period and confirm it is linked to that period, shows the prior reading, and produces the expected usage and bill result.
- Add a decreasing, duplicate, stale, or otherwise invalid reading; confirm it remains visible as an exception and cannot be used to issue a bill until resolved through the existing correction flow.
- Open an anomaly from the reading queue and confirm the review form shows the prior-value comparison, historical average, variance, and direction. Confirm an anomaly-review note is required before the correction can be saved, then verify the correction audit records the note.
- Open an estimated-reading candidate and confirm it remains a suggested value until a field worker enters a field-verification note and explicitly submits it. Confirm the saved reading and its audit record retain that note; cancelling the review must not add a reading.
- Add or locate a missing-reading item; confirm it remains in the reading-exception queue until a valid reading or permitted resolution is recorded.
- Enter a source-side reading before a client reading and confirm it appears as a source-billing review item, not as an automatically payable bill.
- Open a source-billing approval or rejection and confirm the review dialog fixes the account, period, and amount. Cancel it and confirm no source request, bill, or audit status changes. Approve a source-billing request and confirm the resulting bill is held; promote it only with the authorised action and a required reason, then confirm the payable register changes only after promotion.
- Review issued bills and confirm the period view distinguishes valid issued bills from held, voided, partial, failed, or otherwise exceptional bill states.
- Create or locate an invoice with a failed, pending-retry, or unusable-destination delivery result; confirm it appears in the delivery-exception queue and is not represented as successfully delivered.
- Confirm delivery exceptions and campaign recipients classify their recovery cause as provider setup, recipient details, provider failure, or review required; the recorded provider detail remains visible beside the classification.
- Select a ready single-recipient invoice alert and confirm the review dialog fixes the account, bill, channel, recipient, and rendered message. Cancel it and confirm no delivery log or campaign record is created; confirm only the explicit send action starts the delivery attempt.
- Choose a service zone in the invoice-alert workspace and confirm only that zone's rows are available for zone-ready selection. Change the zone and confirm prior selections are cleared. Confirm the campaign review names the frozen zone scope and recipient count; cancel it and confirm no campaign or delivery is created.
- For a payment-plan or standing-order reminder, confirm the review dialog fixes the plan or mandate, recipient, channel, shortfall, and rendered message. Cancel it and confirm no delivery attempt is logged.
- From the customer portal, submit a payment-plan proposal with an instalment, weekly or monthly frequency, preferred first payment date, and supporting details. Confirm it creates only a payment-plan request, appears in the staff collection queue with the proposal, prefills the staff approval form, and does not create an arrangement until staff approve it.
- From the customer portal, submit a billing dispute by selecting a payable bill and dispute reason. Confirm the request retains the bill number, balance snapshot, and reason; it must not change the bill, payment status, or customer balance. Confirm a second active dispute for the same bill is rejected and staff can see the bill context in the maintenance register.
- Confirm **Billing disputes** appears in Today for admins and accountants whenever an active dispute exists. Opening it must show only active billing-dispute cases in Maintenance and must not create, resolve, or alter a dispute.
- From a billing-dispute row, use the account action as an admin or accountant. Confirm Customer 360 opens the matching account; meter-reader workflows must not expose this finance account action.
- Resolve a billing dispute with both internal notes and a customer-facing outcome. Confirm the portal shows only the customer-facing outcome after resolution; it must never expose the internal notes.
- From the customer portal, submit a **Connection** request with a request type and site/location. Confirm optional landmark, access contact, preferred inspection date, and access notes persist in the request detail; missing site/location must be rejected. Confirm submission creates only a maintenance request and does not create a customer, meter, service charge, or service-status change.
- Confirm **Connection requests** appears in Today for authorised field staff when active connection cases exist. Opening it must show only active connection cases in Maintenance, including the submitted request type, site/location, and preferred inspection date where supplied.
- In Maintenance, confirm the daily field plan includes only open and in-progress work, groups it by owner, puts unassigned work first, and orders each group by priority then target date. Confirm a connection request uses its submitted site/location, filters narrow the plan and register together, and opening an account from the plan does not modify the request. Use the calendar action to assign an owner and target date; confirm the request remains open or in progress and the audit trail retains the dispatch update.
- Run `node --test test/fieldDispatch.test.js` from `client` for field eligibility, due-date scope, priority ordering, and address-gap checks. In the embedded browser, verify payment plans, disputes, and billing support stay in the register but not the visit plan. Advance Work date or enable Include future targets to reveal the future connection inspection with its access brief. Confirm these controls do not narrow the register and a zone without a site address still counts as a location gap.
- From a scheduled open field visit, open the plan's visit-review action. Confirm customer, owner, site, reported issue, and recorded costs appear before starting work. Start the visit and confirm the review closes, the request becomes in progress, and the audit trail retains the update. Reopen it, confirm resolution notes are required, then confirm a no-cost visit opens the existing explicit no-expense completion decision.
- Enter field-resolution notes, refresh the browser, and confirm the notes persist only for the same signed-in user/workspace. Simulate an offline browser and confirm the visit review clearly states that notes remain local and prevents start or resolution writes; reconnect before changing request status.
- In the reviewed bulk dispatch action, confirm duplicate selections are rejected. Include a finance/support case with a field request and confirm the entire batch fails without changing the owner or target date of either record.
- In an HTTPS production-like build, confirm the browser recognizes the application manifest and can install the app. Load the app once online, then simulate an offline navigation and confirm the offline page appears. Confirm `/api` reads and all writes remain network-only and that field or batch-reading drafts are not submitted automatically after reconnection.
- Choose a work date and, where relevant, include future targets. Use the field-plan print action and confirm the preview includes only the visible field visits, selected date, access details, owner, priority, and target date. Confirm field-plan controls and action buttons are omitted and finance-support cases or register-only rows never appear in the work pack.
- Select two active field visits, schedule them together, and confirm the owner and target date update for both while their statuses remain unchanged. Confirm an audit event is recorded for each request. Verify that finance-support, resolved, cancelled, stale, or more-than-50 selections are rejected as one transaction with no partial update.
- In the Collections finance-case queue, confirm a payment-plan row shows the submitted terms and **Review plan** opens the linked account approval form. Confirm the terms can be amended, then **Review plan** opens a final summary with the account, agreed amount, instalment, frequency, first due date, and linked customer proposal. Cancelling that summary must not create an arrangement; explicit approval with an audit note must resolve only that linked request and leave all bills and payments unchanged.
- Where an account already has an active payment plan, confirm Collections keeps a new customer proposal out of the approval flow and names the active plan. Staff must close or update the current plan before a second plan can be considered.
- Register a bank mandate from an eligible collection account and confirm **Review mandate** shows the account, mandate reference, expected amount, frequency, first due date, and explicit no-receipt outcome. Cancelling must not create a mandate; registration requires evidence notes and must not create or allocate any payment.
- Close an active payment plan and update an active bank mandate status. In both workflows confirm the entered outcome/status and required notes are reproduced in a final review; cancelling that review must leave the plan or mandate unchanged. Confirm an approved change does not alter bill allocation, receipts, or customer balances.
- Confirm **Decline** on a payment-plan proposal requires a reason, cancels only that request, removes it from the queue, and does not create a plan, receipt, or bill change.
- Create or locate an open customer payment-plan request and confirm Today shows **Payment-plan proposals** for admin and accountant roles. Open it and confirm Collections is focused on payment-plan cases only, without creating or approving a plan.
- Correct the delivery destination or retry the invoice delivery through the existing workflow; confirm the period view reflects the new delivery outcome without altering the bill amount or status.
- Inspect readiness before closure. Confirm outstanding reading, source-billing, bill, and delivery exceptions are counted and link or direct the operator to the appropriate existing review workflow.
- Confirm readiness does not enable a bypass of validation, source-billing approval, bill review, or delivery follow-up requirements.
- Choose Close or Lock for an open period and confirm the review dialog shows the captured bill, balance, warning, and failed-check snapshot. If blockers remain, confirm an audit reason is required before the exception action can be submitted.
- Attempt the same close or lock through `PATCH /api/billing/periods/:id/status` without an override reason and confirm it is rejected. Submit a documented override only in the disposable test period, then confirm the resulting billing-period audit event retains the blocking-check snapshot and the reason.
- Preview penalties, apply penalties, waive one, and reapply it; confirm the related period and bill state remain accurate.
- Close the period only after deliberately resolving or recording the test exceptions. Confirm ordinary corrections are restricted after close and any permitted correction requires the existing audit reason.
- Lock the closed period after final review. Confirm the stricter locked-period correction behavior remains enforced and no guided-cycle action bypasses it.

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
- Open the top-up review and confirm date, units, cost, unit cost, reference, linked-expense/reporting consequence, and required finance approval note; cancel and confirm neither top-up nor expense is created.
- Record the top-up with an approval note and confirm the linked expense is created.
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
- Open the approval review and confirm the run, period, eligible-line count, net payable, stated no-expense consequence, and required approval note; cancel it and confirm the run remains unapproved.
- Approve run with an audit note.
- Open the payment review and confirm the same scope, stated linked-expense consequence, and required payment-posting note; cancel it and confirm no expense is posted.
- Mark run paid with a payment-posting note.
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
- Open invoice approval review and confirm supplier, invoice number, due date, amount, consequence, and required decision note; cancel it and confirm the invoice remains unchanged.
- Approve invoice with a decision note.
- Open the approved invoice expense-posting review and confirm expense date, channel, receipt reference, amount, linked-expense consequence, and required posting note; cancel it and confirm no expense is created.
- Post approved invoice to expense with a posting approval note.
- Confirm linked expense is created.
- Confirm posted or paid invoice cannot be edited.
- Confirm contractor payables reports show open, overdue, and posted amounts.

## Direct Expense Test

- Enter a direct operating expense and open the final review.
- Confirm date, category, vendor, description, amount, payment channel, reference, ledger consequence, and required finance approval note are shown; cancel and confirm no expense is recorded.
- Record the expense with an approval note and confirm the immutable expense audit event retains it.

## Maintenance Expense Test

- Open a non-cancelled maintenance request and enter the linked operating expense details.
- Submit the inline form and confirm the final review fixes the request, customer or zone, date, category, vendor, amount, channel, reference, linked-cost consequence, and no-payment consequence.
- Confirm the finance approval note is required; cancel and confirm no expense is recorded.
- Confirm with an approval note and verify the expense and maintenance-request audit events both retain the decision basis.

## Tariff Pricing Test

- Create or edit a tariff and open the final pricing review.
- Confirm the tariff name, effective date, active state, pricing type, unit or fallback rate, fixed charge, VAT, reconnection fee, and block-row count before saving.
- Confirm the pricing approval note is required; cancel and verify no tariff or version changes occur.
- Update block rows through the same review and verify each tariff audit event retains the approval note.

## Billing Settings Test

- Change a billing-control value and open the final settings review.
- Confirm penalty policy, grace days, deposit rule, bill and receipt sequences, and number padding before saving.
- Confirm that the configuration approval note is required; cancel and verify the live settings remain unchanged.
- Save with a note and confirm the settings audit event retains the decision basis.

## Billing Cycle Start Test

- Select a monthly start date and open the cycle-start review.
- Confirm the month, start, close or bill date, customer due date, and opening status before starting the cycle.
- Confirm the cycle-start approval note is required; cancel and verify no billing period is created or updated.
- Confirm opening the period creates no bills, penalties, balance changes, or invoice deliveries by itself.
- Review a period close and lock before confirming. Confirm every finalization requires a month-end approval note even when readiness checks are clear; where blockers exist, require and retain a documented close override basis as well. Cancelling leaves the period status unchanged.
- Preview a valid expense CSV, open its final import review, and confirm valid-row count, invalid-row count, total, no-payment consequence, and required import note; cancel and confirm no rows are created.
- Import the reviewed CSV with an approval note and confirm the batch audit retains it.

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
- Select a bulk batch and confirm the review dialog shows the exact recipient count, delivery channel, campaign name, and message readiness; cancel it and confirm no campaign or delivery attempt is created.
- Confirm only the explicit **Send campaign** action begins the bulk send, and that changing selection behind the dialog cannot alter the confirmed recipient set.
- Confirm campaign history records recipients.
- In campaign results, confirm a recipient with a linked bill opens that exact bill and a recipient without one but with an account opens Customer 360; neither action may send a message.
- For a campaign with skipped or failed recipients, confirm Campaign Results defaults to **Needs action**, shows the combined unresolved count, and can switch to all, skipped, failed, or sent recipients without changing any delivery record.
- Save reusable template.
- Configure approved WhatsApp template metadata.
- Confirm failed sends are logged clearly.
- Confirm Collections can isolate overdue accounts with no usable delivery channel and opens the affected Customer 360 account for contact repair.
- Confirm Today raises an overdue-contact action when the Collections contact-gap queue is non-empty and opens the same filtered queue.
- In Delivery exceptions, confirm bill and receipt failures open their exact source records, while payment-plan, standing-order, and formal-warning failures open the corresponding prepared review workflow; navigation must not send a message by itself.
- Confirm the disconnection-warning queue includes only accounts more than 90 days overdue and excludes active payment plans.
- Confirm each formal warning is previewed and sent one account at a time with a required approval note, creates delivery/audit history, and does not change customer service status.
- Confirm a successfully delivered formal warning prevents another warning for that account for seven days; failed or skipped attempts must remain available for correction and deliberate retry.

## Operational Reminder Test

- Configure `REMINDER_CRON_SECRET`.
- Preview pending operational reminders as admin/accountant.
- Confirm meter readers cannot access reminder previews or delivery logs.
- In the admin workspace, confirm `Review due` lists only due reminder groups and their workload; canceling the review must not send a message.
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
