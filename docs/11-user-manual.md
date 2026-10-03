# User Manual

This user manual describes the main business workflows for AGUA Global users.

## Login

1. Open the app.
2. Enter email and password.
3. If prompted, change temporary password.
4. Use the navigation menu for available modules.

Visible modules depend on the logged-in user's role.

## Switching Workspaces

Users assigned more than one active access context can change workspaces without logging out.

1. Use the Workspace selector below your name in the sidebar.
2. Select the required staff console or customer portal context.
3. The application opens the matching dashboard or portal and refreshes the available navigation.

Only active contexts assigned to the logged-in account are listed. The switch is recorded in the audit trail.

## Unfinished Forms

Production setup and payroll forms retain unfinished entries while you move between pages in the same browser session. Drafts are specific to your active workspace. Saving or cancelling the form clears its draft.

## Production Meters

Admins and accountants can select Edit from the Production Meters register to update a meter's display name, zone, tariff, notes, or operating status. For a customer-source production meter, the exact active source-backup meter can be rematched to another source meter for the same customer. Meter number, type, and customer linkage remain protected; use Replace Source Meter when the physical production meter changes.

## Replacing Customer Meters

In Readings, use Replace Meter to select the exact active customer meter being changed. This includes source-backup meters. The replacement keeps the same meter role and, for a replaced source-backup meter, automatically rematches active linked production meters to the new source meter.

## Ending Payroll Payees

Admins can terminate recurring employees or cancel recurring service-provider subscriptions from the Payroll register. Enter the effective end date and a reason. The payee remains in historical payroll runs but is excluded from future automatic payroll runs.

## Admin Workflow

Admin typically:

1. Creates users and assigns roles.
2. Sets business profile and logo.
3. Maintains rates and zones.
4. Reviews high-risk billing decisions.
5. Promotes held source bills.
6. Reviews adjustments.
7. Accesses operational backup.
8. Records backup restore drills and reviews backup readiness.
9. Reviews monitoring events and sends monitoring test alerts.
10. Publishes controlled internal documents in the Knowledge Base.
11. Assigns user access contexts where one account needs multiple operating profiles.

Admin should avoid routine payment posting unless acting as backup for finance.

## Accountant Workflow

Accountant typically:

1. Creates and updates customer accounts.
2. Maintains billing periods.
3. Reviews generated bills.
4. Posts payments.
5. Handles receipt edits, voids, and suspense.
6. Records expenses.
7. Runs accountant reports.
8. Sends invoice alerts and receipts.
9. Manages payroll runs.
10. Manages contractors and contractor invoices.
11. Posts approved contractor invoices to expenses.
12. Publishes finance or operations documents in the Knowledge Base.
13. Previews and sends operational reminders.
14. Posts customer service charges for extra billable services.

## Meter Reader Workflow

Meter reader typically:

1. Opens meter reading page.
2. Selects eligible customer.
3. Reviews previous reading context.
4. Enters current reading and date.
5. Submits reading.
6. Raises maintenance request if a meter or line issue is observed.
7. Records production weekly readings where assigned.
8. Uses the Knowledge Base for shared SOPs, manuals, and field instructions.

## Daily Field Dispatch Plan

Maintenance presents a daily field plan above the register. It groups open and in-progress field work by assigned owner, places unassigned work first, and orders each owner's work by priority and target date. Payment plans, billing disputes, and billing support remain in the register and finance queues rather than counting as field visits. The service-zone, owner, category, and status filters apply to both views.

Choose a **Work date** to include work due on or before that day, plus unscheduled requests. Select **Include future targets** to see later visits as well. These two controls apply only to the field plan; the register retains its own full results. The overdue indicator always compares targets with today, even when planning a future work date.

Select the visit-review action on a field-plan item to see the customer, owner, site, meter, reported issue, connection-access brief, and recorded costs before work starts. Open work can be started from this review. In-progress work requires resolution notes to close; the existing no-expense review remains in place so a no-cost completion is an explicit decision.

Field-resolution notes are retained locally for the signed-in user and workspace until the visit is resolved. When the device is offline, the review indicates that notes remain on the device and disables start or resolution actions. Reconnect before submitting a status change; the system does not queue field status changes for automatic replay.

On a supported browser served over HTTPS, AGUA Global can be installed as an app. The installed shell provides an offline page and preserves locally retained field and batch-reading drafts. It does not cache API data or submit financial, billing, reading, or field updates while offline.

Use the print action in the daily field plan to create a work pack for the selected date. It includes only visible field visits, their site and access details, owner, priority, and target date. Use the device print controls to print, save as a PDF, or share it; finance-support cases and the maintenance register are not included.

Select two or more visible field visits to schedule them together. Choose one field owner and target date in the review dialog. The system validates the full selection before updating it, preserves each request status, and records the resulting assignment against every request in the audit trail.

The plan shows the customer location when recorded, or the submitted site location for a connection inspection. A zone alone does not count as a site address. Connection visits also show the preferred inspection date, landmark, site contact, and access notes where supplied. Use the calendar action to review and set an owner and target date; that update is audited and does not close the request. The plan does not calculate travel routes.

## Customer Portal Workflow

Customer can:

1. Log in to customer portal.
2. View dashboard summary.
3. View bills and receipts.
4. Download statement where enabled.
5. View an active payment plan, including its instalment, next due date, and current standing where one has been approved.
6. Review the six-month water-use trend, which reflects verified and billed consumption rather than an estimate.
7. Where enough comparable accounts exist, see a privacy-safe usage comparison against active accounts on the same tariff and in the same zone. Individual account data is never shown.
8. Submit service requests, including billing disputes and payment-plan requests. A billing dispute requires a payable bill and a review reason; it records the bill and balance as submitted but does not pause payment, change the bill, or adjust the account.
9. Attach a meter photo, receipt, or other supporting file to a request from the request history.
10. Submit the current value from the registered billing meter in Requests. The value remains pending until a staff reviewer checks it; it does not update the bill immediately.
11. Open the evidence action beside a submitted reading to attach a clear photo of the meter display. Staff can review the photo with the reading, while other customers cannot access it.

Staff review billing disputes from the maintenance register with the bill number, submitted balance, reason, and customer evidence visible together. Record a resolution note before closing the case. Finance-only requests do not require a maintenance-expense decision, and closing a dispute does not itself alter the bill or balance.

Open **Billing disputes** from Today to work only active customer bill-review cases. This is a routing shortcut; it does not approve a credit, adjust a bill, or close the case.

For an account-specific case, use the account action on the staff row to open Customer 360. It provides bills, receipts, readings, requests, documents, and audit context for the selected account before staff record the dispute outcome.

When resolving a billing dispute, record both internal resolution notes and a concise customer-facing outcome. The portal displays only the customer-facing outcome after resolution, so internal investigation details remain restricted to staff.

## Business Viewer Workflow

Business viewer typically:

1. Logs in and selects the Business Viewer context if prompted.
2. Reviews dashboard health.
3. Reviews reports, audit trail, monitoring, bills, payments, production, payroll, and contractor invoice summaries.
4. Uses shared Knowledge Base documents for reference.
5. Raises observations outside the system or through the responsible operational user.

Business viewer should not be used for operational data entry.

## Customer Management

When creating a customer:

- Enter name, phone, location, and account number.
- Choose rate and zone from dropdowns.
- Confirm deposit state.
- Confirm account number is unique.

Do not delete customers with meaningful history unless the business has approved that data policy. Prefer account closure for historical preservation.

## Meter Reading Entry

Before submitting:

- Confirm account number and customer name.
- Check previous reading and date.
- Check active meter.
- Confirm current reading is reasonable.

If a wrong reading was posted, use edit reading rather than manually changing the database.

## Customer-Submitted Meter Readings

Customer-submitted readings appear at the top of the Readings workspace. For each item, confirm the account, registered billing meter, date, and submitted value against the field record. Approve only a verified value; approval uses the same validations and billing rules as normal reading entry. Reject readings that need correction and include a clear reason. Rejected and approved entries leave the pending queue, while the customer can see the outcome in their portal history without seeing internal review notes.

For routine month-end work, use **Batch Reading Sheet**:

1. Choose the reading date and load customers who are still missing readings.
2. Filter the sheet by account, customer, zone, or meter when working a route.
3. Enter the current reading in each applicable row. Leave customers not yet visited blank.
4. Check calculated usage and resolve any row marked below the previous reading.
5. Select **Preview entered readings** and review the valid, invalid, and expected-bill totals.
6. Select **Import validated batch** only after the preview is fully valid.

The batch is posted atomically: if server validation finds a stale, duplicate, locked-period, or invalid row, no readings or bills from that batch are created. Use the single-reading form when an account has more than one active billing meter.

## Payment Entry

Before posting:

- Select the correct customer.
- Confirm unpaid balance.
- Enter payment amount, method, reference, and date.
- Submit.
- Confirm receipt appears and bill status updates.

If a wrong payment was posted, use edit or void workflows.

Payment History keeps its channel, date, search, and rows-per-page choices on the current device for the signed-in access profile. Select **All history** to clear the saved channel and date view before handing the workstation to another user.

## Incoming Payment Reconciliation

Use **Reconcile Incoming Payments** on the Payments page for bank statements and M-Pesa paybill exports.

1. Select the source type before loading the statement.
2. Map the statement columns for payment date, amount, reference, and, where available, customer account and payer details.
3. For M-Pesa, also map the transaction status. Only completed or successful transactions may proceed.
4. Review proposed customer matches. Exact account or high-confidence, unambiguous phone matches may preselect; name-only and ambiguous matches require an explicit operator selection.
5. Resolve every statement row. If a row is excluded from this import, record its reason; the final validation shows both the posted and excluded counts and values. Validate the generated payment rows, then review the final payment count, total, and source before posting.

Each imported bank or M-Pesa reference is checked against the current file and posted receipts before any money movement is created. Imported M-Pesa transaction status is retained in the payment notes and audit trail.

When the direct M-Pesa callback pilot is enabled, open **M-Pesa Callback Control** in Payments to confirm callback readiness and review authenticated confirmations. Filter the queue by rejected, posted, or duplicate outcomes and retain the selected outcome and row count for the current signed-in access profile on that device. Posted and duplicate callbacks are informational. A rejected callback never posts a receipt or creates suspense automatically; use its account/reference and reason to reconcile the transaction deliberately from the statement workflow. Callback activity is receipt-posting evidence, not provider settlement confirmation; reconcile settlement separately from the M-Pesa statement.

## Delivery Recovery Policy

The system does not retry customer communications automatically. In **Delivery exceptions** and **Campaign Results**, review the recorded provider detail before starting one deliberate resend from the relevant workflow. A customer-disabled delivery channel is never retried; open the customer account to change a preference only when the customer has requested it. Correct missing contact details or provider setup first, then initiate the new send so it has its own delivery and audit history.

After posting, **Recent Payment Imports** provides an append-only batch summary with its reference, source, posted and excluded counts, totals, channel split, CSV fingerprint, actor, and recorded time. Detailed exclusion reasons remain in the protected audit event; the source CSV itself is not exposed in this view.

## Management Signals

The Today workspace includes a current-month **Business health** strip for management roles. Each measure is a drill-down, not a target to manipulate: collection rate is allocated receipts against bills issued this month; reading completion is completed active client-meter readings; billing blockers are held bills and pending source-billing reviews; delivery reliability uses the last 14 days of recorded delivery attempts; and accrual margin is current-month payable-bill revenue less recorded operating expenses. Meter-reader workspaces show only the reading and billing readiness measures.

Reports includes a **90-day cash outlook** for management planning. It uses the last three complete calendar months of payable billing, payment allocation, and recorded expenses. Active payment plans and standing-order schedules are shown as committed coverage, but are not added to the collection baseline; the forecast uses the higher value to avoid counting the same expected cash twice. Treat it as a planning signal and review its assumptions before committing expenditure.

### Monthly budget control

The **Monthly budget control** panel records a revenue target, collection target, and operating-expense budget for each calendar month. Administrators and accountants can create or revise targets; business viewers can review the same register without changing it. The report compares revenue with payable bills for that billing month, collections with posted receipts by payment date, and costs with recorded expenses by expense date. A negative revenue or collection variance needs review; a negative operating-cost variance means recorded costs have exceeded the budget. Enter the basis or approval reference in the notes field so a later review can understand the target. Every change is recorded in the audit trail.

Billing Setup includes a **Revenue assurance** queue for the selected period. It separates client-meter readings that have no linked bill, bills generated but still held, and accounts with no period reading. Use the row action to open the appropriate reading or bill workflow. The queue shows verified consumption units and existing held-bill value, but does not estimate a monetary value for consumption that has not passed the normal billing rules.

Before closing or locking a period, the review dialog captures the current close snapshot: payable bills, billed value, open balance, warnings, and any failed checks. Resolve blockers through their linked workflows where possible. An exception close with blockers requires an audit reason; closing or locking restricts later corrections under the existing controls.

When a current-month client-meter reading has no linked bill, **Today** raises an **Unbilled consumption** action. It opens Billing Setup with the revenue-assurance queue in context; resolve the underlying reading under the existing billing controls rather than posting an inferred charge.

For a month in the 90-day outlook, **Use forecast baseline** pre-fills the three target fields from the disclosed forecast. It does not save or approve anything: review and adjust the figures, then save the budget deliberately.

When the current month has no target, **Today** adds a setup action so variance monitoring is not silently skipped. When a current-month target is behind, Today adds a high-priority Monthly budget variance item. Open either item to review the budget register. The management signal board also shows current revenue against target when that month's budget exists.

The same panel shows **operating cost per bill** and **operating cost to collections**. Both use all recorded operating expenses over the trailing period. They are efficiency signals, not proof that every expense was caused by billing or collections work.

In the Customer Portal, use **Bill delivery preferences** to select available email, SMS, and WhatsApp channels and choose one enabled channel as the preference. Contact details remain managed by customer care; unavailable channels stay disabled until the relevant email address or phone number is corrected. Customers can opt out by disabling every channel. In the customer-care form, the preferred channel follows an enabled alternative when available. When customer care changes delivery preferences, the customer request or operational reason is required and retained in the customer audit record.

In the Customers register, use the **Delivery** filter to isolate campaign-ready accounts, enabled channels needing contact repair, or deliberate opt-outs before preparing customer communications. The register's status, zone, delivery, search, and rows preferences stay on the current device for the signed-in access profile.

Customer 360 shows the same delivery readiness beside the preferred channel. When an account needs contact repair or is opted out, its edit action is labelled **Repair delivery**; opening it does not alter any preference or send a message.

## Connection Requests

Customers with an existing portal account can select **Connection** in Requests to ask for a site inspection. Choose the request type, enter the site or location, and add a landmark, preferred inspection date, access contact, or access notes where those will help the field team. Attach photographs or supporting files after submitting when relevant.

The request is not a connection approval. It does not create a customer account, install or move a meter, apply a service charge, or change service status. Staff see active requests in **Today** and the focused Maintenance queue, then confirm site feasibility and use the existing controlled customer, meter, and service-charge workflows for any approved follow-up.

## Payment Plans

Use the Collections workbench to set an approved payment plan for an overdue account. Record the agreed balance, instalment amount, frequency, first due date, and approval notes. When the customer has an open payment-plan request, it is preselected for linkage so the request, evidence, approval, and arrangement remain traceable. Only one active plan may exist for an account.

Customers can submit a payment-plan proposal from the portal by stating a proposed instalment, weekly or monthly frequency, preferred first-payment date, and supporting details. The proposal does not change the account, waive a balance, or create an arrangement. Staff can select **Review plan** from the Collections finance-case queue to see the submitted terms and open the linked approval form; they may amend every proposed term, and only the existing staff approval creates the audited plan. That approval resolves the linked request with the plan reference; it does not alter bills or post a payment.

Where terms cannot be supported, staff can select **Decline** and record why. This closes only the proposal and does not create a plan or change the balance, bills, or receipts.

Open customer proposals also appear as **Payment-plan proposals** in Today for admins and accountants. Opening the action applies a focused Collections view; it is a review shortcut, not an approval.

Today also raises **Overdue accounts missing contact** when receivables cannot be reached through an enabled email, SMS, or WhatsApp channel. Open it to land on the same **Contact gaps** filter in Collections, then open the account to repair the contact record before sending any collection communication.

The Collections workbench groups overdue accounts into **1-30 days**, **31-90 days**, and **90+ days**. Use those filters to work an age band deliberately; the selected age band, account search, and rows-per-page preference stay on the current device for the signed-in access profile. The highest-balance 20% of accounts in the active arrears portfolio receive a **Top exposure** marker; it is a transparent prioritisation aid, not a customer status. Use **Contact gaps** to isolate overdue accounts that cannot receive email, SMS, or WhatsApp; the account brief opens Customer 360 directly for repair. For an eligible 90+ day account without an active payment plan, **Prepare warning** opens the formal warning workspace.

The Today management signals include **Days Sales Outstanding (DSO)**. It is calculated from current open payable receivables and payable bills issued during the trailing 90 days. Open the signal to work the arrears queue; a dash means there is not enough trailing billing to calculate a meaningful result.

A payment plan records a collection commitment; it does not change bills, waive charges, or post a payment. Continue recording received money through Payments. The active-plan watchlist compares receipts posted after approval with instalments due and flags plans as upcoming, on track, or behind. When the plan ends, record whether it was completed, defaulted, or cancelled and provide closure notes.

For a plan that is behind, select the reminder action from Collections. The reminder queue shows the expected amount, receipts received, shortfall, available delivery channels, and the rendered message before a staff member sends it. Select **Review** to confirm the plan, recipient, channel, shortfall, and rendered message; cancelling has no delivery side effect. The plan watchlist records the latest reminder channel, delivery result, and time so staff can avoid duplicate follow-up. Payment-plan templates are stored separately from invoice templates. A reminder is always sent one account at a time and is recorded in delivery history and the audit trail.

## Standing Orders

Use the Collections account brief to register a bank mandate when a customer has supplied the reference that will appear in the bank narrative. Enter the expected amount, frequency, first due date, and any evidence or agreement note. An account can have one active mandate, and every registration or status change is recorded in the audit log.

The active standing-order watchlist compares the expected schedule with confirmed receipts whose payment details contain the mandate reference. Paused and cancelled mandates no longer count as expected collection. When reviewing bank or M-Pesa imports, a unique active mandate reference can preselect the corresponding account; staff must still review, validate, and post the transaction before the system creates a receipt.

The Today dashboard raises **Standing orders behind** when the watchlist finds scheduled mandate amounts without matching confirmed receipts. Open the item to work directly from the filtered collections watchlist. Standing-order reminders use the same explicit review of the mandate, recipient, delivery channel, shortfall, and rendered message before a one-account send can start.

For a mandate that is behind, select the mail action in the standing-order watchlist. The reminder workspace shows the exact mandate reference, expected schedule, confirmed matched receipts, shortfall, rendered message, and delivery readiness before a staff member sends it. Reminders are always explicit, one-account sends and are recorded in delivery history and the audit trail.

## Customer Service Charges

Admins and accountants can post extra billable services from the Customers page.

Use this workflow for charges such as:

- Meter replacement.
- Reconnection.
- New connection.
- Inspection.
- Repair.
- Water delivery.
- Admin fees.

Recommended workflow:

1. Open Customers.
2. Find the customer account.
3. Select Service Charges.
4. Enter charge type, description, amount, charge date, due date, and optional notes.
5. Post the charge.
6. Confirm the charge appears in the service charge table and the customer balance.

The system creates a linked payable bill for the charge. Payments, statements, receivables aging, and customer balances then treat it as part of the customer's payable portfolio. Accountant reports separate Customer Service Charges from ordinary water usage revenue.

Unpaid service charges can be waived by admin/accountant with a reason. Admins can cancel unpaid service charges. Charges with payments are locked from waiver/cancellation and should be handled through the normal correction/payment reversal process.

## Communications

Use Communications to:

- Preview customers with invoice alerts.
- Select one channel per batch: email, SMS, or WhatsApp.
- Edit alert message.
- Save reusable templates.

The Collection message library provides reviewed starting points for a bill due reminder, first overdue reminder, 7-day overdue follow-up, and a 30+ day account action notice. Choose the wording that matches the account stage, inspect the rendered customer preview, then save a local copy when the business needs an approved variation. The 30+ day notice is deliberately manual: confirm that the applicable service terms and approval policy support it before sending.

For a bulk campaign, select the ready accounts and choose **Review selected**. The final review fixes the selected recipients, channel, campaign name, and prepared message for that send. Review it before selecting **Send campaign**; cancelling leaves the queue unchanged.
- Use the **Service zone** selector to stage a smaller delivery run. Changing the zone clears the prior selection, so a review cannot silently combine accounts from two operating areas. The final review shows the selected zone when one is active; it remains a review only until **Send campaign** is selected.
- For one account, select **Review** in its row. The same review step fixes the account, invoice, recipient, channel, and prepared message before the delivery attempt begins. Cancelling does not send or log a message.
- Give campaigns clear names.
- Review campaign history and recipient results. Campaigns with skipped or failed recipients open on **Needs action** by default; use the outcome filter to inspect the full history. Each recipient links to its bill when available, or to Customer 360 when contact repair is needed; opening either record does not resend the campaign.

The invoice-alert channel, readiness and service-zone scope, campaign outcome view, and the search/row-density settings for communication registers stay on the current device for the signed-in access profile. Recipient selections and message content are not retained after a refresh.

From Today, select Delivery reliability to open the delivery exception queue. It lists failed and skipped attempts from the last 7, 30, or 90 days across bills, receipts, payment plans, standing orders, and formal warnings. Each row identifies whether recovery depends on provider setup, recipient details, a provider failure, or a deliberate review, and preserves the recorded provider detail. Use the source-aware next step to reopen the failed bill or receipt, or prepare the relevant reminder or warning review; open the customer account when contact repair is needed. The queue never retries messages automatically. Its selected period, status, search, and rows preference stay on the current device for the signed-in access profile.

The **Disconnection warnings** workspace is a controlled communication step, not a service-control feature. It includes only accounts more than 90 days overdue and automatically excludes accounts with an active payment plan. Staff must inspect the rendered notice and delivery channel, then provide an approval reference or escalation note before sending one warning at a time. A successfully delivered warning places that account in a seven-day cooldown; failed or skipped attempts can be corrected and retried deliberately. Each attempted send is logged and audited; it never changes the customer service status or disconnects a meter.

For WhatsApp, use approved templates when provider policy requires them.

## Knowledge Base

Use the Knowledge Base for controlled internal documents such as SOPs, deployment notes, test checklists, manuals, policy references, and implementation records.

Admins and accountants can:

- Upload a document.
- Set category, sensitivity, version label, and summary.
- Choose which roles can view and download it.
- Update metadata when a document changes.
- Archive or remove outdated documents.

Meter readers and business viewers can only see documents shared with their role. Downloads are recorded in the audit trail.

## Operational Reminders

Admins and accountants can preview and send reminders for operational work such as pending tasks, end-month meter readings, weekly production readings, billing preparation, contractor invoices, and payroll preparation.

Recommended routine:

1. Open the reminders area from the operational/settings surface.
2. Preview pending reminders before sending.
3. Send only the relevant reminder type.
4. Review reminder logs to confirm delivery attempts and avoid duplicates.

Scheduled reminder runs are handled by cron routes when deployed.

## Monitoring And Public Status

Admins can review the monitoring alert snapshot and send test alerts. Admins, accountants, and business viewers can review monitoring summaries and event logs from Business Settings. Administrators can resolve a reviewed warning, error, or critical event only after recording what was verified, corrected, or accepted; the original event remains visible with the resolver, timestamp, and note.

Monitoring tracks:

- API and database status.
- Failed logins.
- Server-side errors.
- Client-side page crashes reported by the app.
- Alert send and cooldown history.

The public status page shows API and database reachability without exposing operational records. It is intended for uptime checks and lightweight external visibility.

## Integration Commissioning

Business Settings begins with the Integration Readiness panel. It shows redacted readiness for delivery channels, M-Pesa callbacks, bank feeds, public uptime, and provider-managed database resilience. Administrators record the date, outcome, external evidence reference, findings, and any follow-up action after a provider or hosting check. A passed outcome requires an evidence reference. Accountants and business viewers can review the register but cannot create or change records.

An evidence record does not enable a provider, post a receipt, or change a customer account. Keep the actual provider message, ticket, runbook, or monitoring evidence in the business-controlled system identified by its reference.

The adjacent Production Host Setup panel lists only the environment-variable names and commissioning steps needed by each provider. Use its checklist export for deployment handover. Secret values are entered exclusively in the production host's secret manager; AGUA never accepts or displays them in the browser or database.

Use **Commissioning packet** to download the current redacted readiness, each external completion gate, and its latest evidence record. Share that file with the accountable provider or hosting operator as the working handover record; it does not include passwords, tokens, or private provider credentials.

Use **Print handover** to create a styled browser-PDF version of the same operational record. It includes the evidence register and variable names needed by the production host, but never the corresponding values.

## Backup And Restore Drills

Admins should use the backup area in Business Settings to review backup readiness and record restore drills.

For each drill, record:

- Drill date.
- Backup reference.
- Target environment.
- Duration.
- Dataset count.
- Status.
- Findings and follow-up actions.

Provider-native database backups and point-in-time recovery are still configured with the database host. The application restore drill ledger records the business evidence that recovery has been practiced.

## Print And PDF Defaults

Admins can set business print defaults such as page size, orientation, margin, scale, fit-to-page behavior, and wide-report compression. Use these settings to make bills, receipts, reports, and production prints consistent across browsers and printers.

## Contractor Invoices

Accountants and admins can:

1. Create contractor records.
2. Capture contractor invoices.
3. Attach supporting documents.
4. Submit, approve, or reject invoices.
5. Post approved invoices to expenses.
6. Review contractor payables reports.

Posted or paid invoices are protected from normal editing.

## Supporting Documents

Supporting documents can be uploaded against:

- Maintenance requests.
- Expenses.
- Contractor invoices.

Use attachments for invoices, photos, receipts, work evidence, or approval support.
Files must be PDF, PNG, JPG, WEBP, DOCX, or XLSX and no larger than 3MB.
