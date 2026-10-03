# Implementation Records

This file records major implemented capabilities and important operating notes. Keep it updated after each release-sized change.

## Current Implemented Capability

Foundation:

- React frontend.
- Express API.
- PostgreSQL database.
- JWT authentication.
- Roles: admin, accountant, meter_reader, customer, business_viewer.
- Business viewer role for read-oriented oversight.
- User access profiles with login context selection and in-session workspace switching.
- Context switches rotate the browser session and CSRF token, refresh the destination workspace, and create `auth.context_switched` audit events.
- Tracked SQL migration runner with `schema_migrations` checksums and status output.
- Idempotent `db:seed:scenarios` development dataset, labelled `DEV-*`, for stable operational test states without resetting unrelated development records. The runner blocks production environments.

Customer and setup:

- Customer CRUD.
- Rates and zones.
- Effective-dated tariff versions and tariff blocks.
- Customer deposits, opening balances, account closure, and adjustments.
- Customer portal user links.
- Multi-account customer portal links.

Metering and billing:

- Active meters.
- Previous reading context.
- Meter replacement events.
- Reading imports.
- Editable readings and recalculated bills.
- User/workspace-scoped Batch Reading Sheet for inline monthly entry, keyboard row progression, prior-reading checks, preview, and atomic bill-generating import.
- Billing periods.
- Penalties, waivers, and reapplication.
- Source-side billing review and bill promotion.
- Customer service charges that post linked payable bills for extra billable customer services.

Payments and finance:

- Receipt-level payments.
- Allocation across oldest unpaid bills.
- Editable payments.
- Suspense handling.
- Recently Corrected payment timeline for corrected, voided, reapplied, and discarded actions, showing receipt, amount, reason, actor, and time with access to the applicable receipt.
- Normalized, redacted `GET /api/payments/corrections?limit=N` history for admin, accountant, and business viewer roles; reapplied events link to the replacement receipt.
- Printable and sendable receipts.
- Payment imports.
- Expenses and expense imports.
- Bank and M-Pesa statement PDF/CSV reconciliation trainer.
- Four-stage incoming-payment reconciliation flow for source selection, column mapping, conservative customer matching, and final validation/import, with user/context-scoped session recovery.
- Exact account and high-confidence, unambiguous phone matches may preselect; name-only and ambiguous matches require operator selection.
- Posted bank and M-Pesa transaction references are unique per channel; previews reject missing, repeated, and previously posted references before any write. M-Pesa imports additionally require a completed transaction status, retained in the payment note and audit trail.
- Payment imports require a final review confirmation. Excluded statement rows require a reason and are retained in the immutable audit event; the redacted batch summary shows posted and excluded row/value totals alongside source, channel split, CSV SHA-256 fingerprint, actor, and timestamp. Eligible operational roles can read summaries without CSV contents.
- Guarded M-Pesa confirmation pilot with a finance-visible callback-control queue for authenticated posted, duplicate, and rejected outcomes. Rejections remain non-financial events; they never create receipts or suspense automatically.
- Customer service charge revenue separated in accountant profit/loss reporting.

Operations:

- Dashboard with KPI cards and charts.
- Reports, accountant reports, data quality checks, and backup report.
- Backup manifest, operational backup export, and local retention scripts.
- Restore drill ledger with latest drill status and next quarterly due date.
- Backup exports include operational logs, monitoring logs, restore drills, commissioning evidence, customer service charges, and knowledge documents where the tables exist.
- Public status endpoint and status page for API/database checks.
- Application monitoring for API errors, database failures, failed logins, and client page crashes.
- Monitoring alert runner with email/SMS delivery, cooldown logging, and Vercel Cron path.
- Public documentation hub for a docs subdomain.
- Authenticated knowledge base for private SOPs, manuals, and controlled documents.
- Knowledge document downloads are recorded in the audit trail.
- Operational email reminders for pending work, end-month meter readings, weekly production readings, billing preparation, contractor invoices, and payroll preparation.
- Reminder schedules gate sends by due window and support `types` filtering for separate external scheduler runs.
- Reminder logs are recorded and included in operational backup exports.
- Maintenance requests and linked maintenance expenses.
- Supporting documents for maintenance requests, customer reading submissions, expenses, and contractor invoices, stored in PostgreSQL with a 3MB upload limit for Vercel compatibility.
- Audit trail.
- Business settings and logo handling.
- Business print/PDF defaults for page size, orientation, margins, scale, and wide-print compression.
- Integration readiness console with redacted configuration status for delivery, payment, uptime, and database-resilience dependencies.
- Administrator-recorded commissioning evidence for provider and hosting checks, including verification date, evidence reference, findings, follow-up action, and audit history; accountant and business-viewer roles can read the evidence register.

Production:

- Source production meters.
- Production meter editing for operational details, tariff, zone, notes, active/inactive/faulty status, and rematching a customer-source meter to an active source-backup meter for the same customer; physical replacement remains a separate audited workflow.
- Customer-meter replacement supports both client-billing and source-backup meters, preserves the source role, and automatically rematches active linked production meters when a source-backup meter is replaced.
- Weekly production readings.
- Electricity top-ups.
- Top-ups post linked expenses.
- Dashboard production chart compares revenue and electricity cost.
- Weekly production form shows previous prepaid kWh balance and previous meter readings for the selected date.
- Production reports show previous and current readings, and full print separates weekly summaries from meter details.

Payroll:

- Payroll payees.
- Context-scoped session drafts for production setup and payroll forms, cleared after save or cancellation.
- Dated payroll payee termination/cancellation dialog with reason capture and audit history.
- Recurring employees/subscriptions.
- Period-only casuals/contractors.
- Payee termination.
- Payroll runs.
- Submit, approve, and paid lifecycle.
- Payroll expense posting.
- Downloadable payslip PDFs from payroll line items.
- Payroll run review, lifecycle controls, line export, payslip access, and editable draft-line controls now share a dedicated workspace while PayrollPage retains API mutations and approval permissions.

Maintenance:

- Single-request and bulk field-dispatch dialogs now share a dedicated workspace. MaintenancePage retains requests, assignee data, schedule mutations, and audit-sensitive state transitions.

Contractors:

- Contractor register.
- Contractor invoices with draft, submitted, approved, rejected, posted-to-expense, and paid states.
- Contractor invoice document attachments.
- Contractor invoice posting into expenses.
- Contractor payables, balances, and invoice register reporting.

Communications:

- Invoice alert preview.
- Single and bulk send.
- Campaign history.
- Campaign naming.
- Reusable templates.
- Email, SMS, and WhatsApp delivery paths.
- Approved WhatsApp template metadata for Meta and Twilio.
- Customer portal meter-reading submissions with optional meter-photo evidence, staff review, audit history, and no billing impact until approval.
- Customer portal six-month water-use trend based on verified billable consumption.
- Customer portal privacy-safe usage benchmark against active accounts with the same tariff and zone, shown only when at least three comparable accounts have billed usage.

UX:

- Responsive layout across desktop, tablet, and mobile.
- Compact density pass.
- Desktop sidebar scroll.
- Fixed toast messages for success, failure, and notices.
- Dashboard chart headroom and responsive data ranges.
- Role-aware keyboard operation: `Ctrl/Cmd+K` opens global search; authorised staff can start a customer, meter reading, or payment with `Ctrl/Cmd+N`, `Ctrl/Cmd+R`, or `Ctrl/Cmd+P`; `Ctrl/Cmd+/` opens the shortcut reference.
- Profile-scoped report period presets for month-to-date, previous month, quarter-to-date, year-to-date, and retained custom date ranges.
- Batch Reading Sheet drafts survive browser restarts for the active user and workspace, preserving field entry during temporary connectivity loss without queueing unvalidated billing writes.
- Standing-order mandate register with audited lifecycle, expected-versus-confirmed collection watchlist, and reference-led customer suggestions in bank and M-Pesa reconciliation. Mandates never create receipts; only confirmed imported payments can do that.
- Today action center now flags standing-order schedules that are behind their confirmed, reference-matched receipts and opens the filtered collections watchlist.
- Role-aware Today management-signal strip with defined current-month collection, reading completion, billing readiness, delivery reliability, and accrual-margin measures. Each signal opens the workflow that can improve it; meter-reader workspaces remain limited to field and billing-readiness measures.
- Standing-order reminder workbench with reusable templates, exact rendered previews, channel readiness, one-account send control, delivery logs, and audit events.
- Delivery reliability now opens a dedicated, bounded delivery-exception queue across bills, receipts, payment plans, and standing orders. Operators can open the linked Customer 360 record to correct contacts before deliberately resending; failures are never retried automatically. Both the queue and campaign results classify provider setup, recipient-detail, and provider-failure issues while keeping the recorded provider detail visible for audit and recovery.
- New bulk campaign recipients retain the provider skip or failure detail alongside their delivery log, so the campaign recovery view can classify the next action without inferring from a generic status. Historic rows without a retained provider detail remain explicitly marked for review.
- One-recipient invoice alerts now use the same explicit, immutable review pattern as bulk campaigns. The prepared account, bill, channel, recipient, and message are confirmed before a delivery request can start; cancelling has no delivery side effect.
- Payment-plan and standing-order reminders now use the same immutable one-account review pattern. Their plan or mandate, recipient, channel, shortfall, and rendered message are confirmed before a delivery attempt can start.
- The customer portal now captures a structured payment-plan proposal: requested instalment, frequency, and preferred first-payment date. It remains an unapproved service request until staff review and explicitly create the linked arrangement; Collections prefills the proposal only as a starting point for the staff decision.
- Collections now shows submitted payment-plan terms in its finance-case queue and opens the exact linked account and approval form through **Review plan**, retaining staff control over all final terms and approval.
- Approving a linked payment plan now resolves that exact open request in the same database transaction and records the arrangement reference, preventing completed work from remaining in the finance-case queue.
- Today now surfaces open customer payment-plan proposals for collection staff and routes directly to a Collections view filtered to those cases.
- Payment-plan proposals now have a controlled decline outcome: staff must record a reason, the request is cancelled and audited, and no plan or financial transaction is created.
- Customer bill disputes are now structured portal cases: the customer selects a payable bill and reason, the system stores a bill-and-balance snapshot, prevents duplicate active disputes for the same bill, and exposes that context to staff. Finance-only case resolution requires notes but bypasses the irrelevant maintenance-expense prompt. A dispute never changes a bill, payment, or balance by itself.
- Today now raises active customer billing disputes for finance roles and opens a Maintenance view limited to those cases, keeping bill-review work visible without mixing it into the normal field-work queue.
- Finance staff can now open the matching Customer 360 workspace directly from a maintenance case, preserving the existing role boundary while making the account evidence available before a dispute resolution is recorded.
- Billing-dispute resolution now requires a separate customer-facing outcome alongside internal notes. The portal projects only that safe outcome after resolution, avoiding both an unexplained closure and disclosure of internal investigation detail.
- Customer portal connection requests now capture a structured field-inspection brief: request type, site/location, optional landmark, site-access contact, preferred inspection date, and access constraints. The request is surfaced as a focused Today/Maintenance queue but deliberately creates no customer, meter, charge, or service-status change.
- Maintenance includes a dispatch plan for active field work, grouped by owner and ordered by priority then target date, with unassigned work first. A work-date cutoff includes due and unscheduled visits; a toggle includes future targets. Finance/support cases are excluded from visit totals, zone-only locations remain address gaps, and connection access details are visible. The reviewed calendar action saves audited owner and target-date updates while preserving request status.
- Dispatch planning verification (2026-09-13): four focused client tests and the production build passed. The embedded browser confirmed one due visit for September 13, three visits with future targets included or a September 18 cutoff, an unchanged eight-request register, stored customer addresses, and the connection contact/access brief in the narrow app panel. The development API was restarted to load the current response fields.
- Field-plan entries now provide an in-context visit review with the customer, owner, site, meter, reported issue, connection brief, and recorded-cost context. An open visit can be started there; an in-progress visit requires notes before it can enter the existing explicit no-expense or resolution path. A permanent development visit, `MR-00148`, was created for this acceptance path.
- Field-resolution notes now persist locally per user/workspace until submission. Offline state is explicit in the field review and blocks status writes rather than queuing an unreviewed operation. This extends offline resilience without changing the server-audited lifecycle or automatically replaying a resolution.
- The client now includes an installable-app manifest and production-only service-worker registration. The service worker caches only the shell and static assets, serves an offline fallback for navigation failures, and bypasses every `/api` request. HTTPS is required for installation and service-worker operation outside localhost.
- Daily field dispatch now has a print/share work pack scoped to the active date and future-target selection. It prints only operational field visits and their dispatch details, not finance-support cases or the full maintenance register.
- Field dispatch now supports a reviewed bulk owner/target assignment for up to 50 selected active field visits. The API validates the complete selection, updates it in one transaction, keeps request statuses intact, and writes one audit event per visit.
- Bulk field dispatch rejects duplicate selections and mixed field/finance batches before any update. Regression coverage confirms a rejected batch leaves both existing field assignments and finance-case records unchanged.
- The M-Pesa callback control is now isolated from the Payments workspace, preserving the callback queue and refresh behavior while reducing the page-level responsibility of the financial workbench.
- The standalone CSV import panel is also isolated from Payments. Its template, preview summary, validation trigger, and explicit import-review gate retain the same behavior while the reconciliation wizard remains separately contained for a later focused decomposition.
- Recent payment-import history is now a dedicated component, keeping immutable import summaries and their operational metadata separate from receipt and reconciliation state.
- The CSV validation table is now isolated from Payments as a read-only preview component, retaining all row-level errors and warnings before the existing explicit import confirmation.
- Receipt presentation, print, delivery history, and audit display now live in a dedicated payment receipt panel. Payment retrieval, sending, and state transitions remain controlled by the page-level workflow.
- The payment-history register is now a dedicated component with callback-only controls for print, delivery, correction, and void actions. Filters and all financial decisions remain owned by the page workflow.
- Suspense and adjustment approval registers are now isolated with callback-only action controls. The parent retains the guarded review dialogs and all server-side mutation paths for reapplication, discard, approval, and rejection.
- Payment review-dialog presentation is now isolated from the page state. The page keeps confirmation handlers, import state, validation errors, and every financial mutation under its existing guarded workflow.
- Billing-period close and lock review now includes the captured readiness snapshot and requires an audit reason when an operator deliberately proceeds with unresolved blockers. The status API independently enforces that override reason and writes the reviewed blocker snapshot into the billing-period audit event, so a direct request cannot bypass the decision record.
- Billing Cycle now exposes a 95% reading-completion recommendation for bill-preparation pacing. It is derived from the selected period, remains visible beside the existing strict close checks, and never auto-issues bills, sends invoices, or changes period status.
- Management reports now include an assumption-led 90-day cash outlook. It separates trailing collection performance from scheduled payment-plan and standing-order coverage, and prevents their overlap from being counted twice in projected collections.
- The cash outlook also exposes trailing operating cost per bill and operating-cost-to-collections ratio, with a disclosed all-operating-expense basis to avoid falsely attributing every expense to collections.
- Monthly budget control records auditable revenue, collection, and operating-expense targets by calendar month. Management reports compare those targets with payable bills, posted receipts, and recorded expenses, making variance review explicit rather than relying on inferred targets.
- Current-month budget variance now feeds the Today Action Center and management signal board, with a focused route to the monthly budget register for administrators, accountants, and business viewers.
- A missing current-month budget target is also surfaced as a setup action, preventing variance monitoring from being silently unavailable during the operating month.
- Budget setup can prefill from the matching 90-day forecast row, while keeping target review and saving as an explicit human decision.
- Collections now separates early arrears, 31-90 day at-risk accounts, and 90+ day critical accounts, while marking the highest-balance 20% of the active queue as top exposure. The queue keeps the existing payment, reminder, account, and payment-plan actions in one place.
- Collections now isolates overdue accounts with no usable delivery channel, quantifies the balance blocked by contact gaps, and routes staff directly to Customer 360 to repair outreach data before they spend time on collection follow-up.
- Today now promotes overdue contact gaps into the operational action queue and opens the identical filtered Collections view, so unreachable receivables are discovered during daily prioritisation rather than only inside collections work.
- Delivery exceptions now provide source-aware recovery paths to the exact bill, receipt, payment-plan, standing-order, or formal-warning workflow; staff still initiate any resend explicitly.
- Bulk invoice alerts now require a final review that fixes the recipient set, channel, campaign name, and prepared message before any campaign is created or delivery attempt begins.
- Bulk invoice alerts can now be staged by service zone. Switching the zone clears the previous selection, the scope is included in the final review and default campaign name, and no delivery occurs until the existing explicit campaign confirmation. The server persists the zone on the campaign and rejects mixed-zone recipient sets.
- Campaign recipient results now link directly to the affected bill or Customer 360 record, closing the loop between a failed or skipped campaign outcome and its recovery work.
- Campaign Results now opens on a bounded needs-action queue whenever recipients were skipped or failed, exposes the combined unresolved count, and retains outcome filters for audit review without changing delivery history.
- Campaign-history and recipient-recovery presentation now share a dedicated workspace. CommunicationsPage retains campaign queries, immutable recipient data, delivery review dialogs, and every explicit send decision.
- The management signal board now includes Days Sales Outstanding (DSO), calculated as open payable receivables divided by payable billing from the trailing 90 days, multiplied by 90. The UI explicitly withholds the measure when no 90-day billing base exists.
- Billing Setup now includes a selected-period revenue-assurance queue. It exposes customer-level unbilled client-meter consumption, held bill value, and missing readings with direct recovery drill-downs, while deliberately avoiding speculative monetary leakage estimates.
- Current-month unbilled client-meter consumption now also feeds Today and the billing-readiness management signal, linking an immediate revenue-risk action to the period-level recovery queue.
- Formal disconnection-warning preparation is now a guarded communications workflow: only 90+ day overdue accounts without active payment plans are eligible, staff record a mandatory approval note before each one-account audited send, successful sends enforce a seven-day cooldown, and the feature deliberately records no service-status change or automatic disconnection.
- Monthly budget control presentation now lives in a dedicated component. ReportsPage retains permissions, report data, forecast-baseline selection, and the audited save workflow, reducing the risk of presentation changes affecting financial behavior.
- Data-quality review presentation now has the same separation: ReportsPage still derives findings, focus state, and review selection, while the component renders the queue and affected-record detail.
- Management and accountant report catalog presentation now share a reusable component, leaving report calculation, print scoping, and active-report state in ReportsPage.
- The 90-day cash-outlook presentation is now isolated from reports state and API loading. Forecast assumptions, values, and formatting are passed in explicitly, retaining the existing planning-only disclosure.
- The management performance signal strip is now a focused component, while ReportsPage retains the totals and quality-finding calculations that drive it.
- Printable management and accountant report headers now share the same business-identity component. Scope-specific titles and reporting periods remain explicit at the page level.
- API smoke coverage now exercises the contractor-payable lifecycle: draft invoices cannot create expenses, approved invoices post once to a linked expense, duplicate posting is refused, and approval/posting audit events are retained. The test removes all created development artifacts.
- Payroll smoke coverage now verifies the approval gate before a run can be paid, then confirms the paid run creates a linked expense and retains approval/payment audit events. Its employee, run, line, expense, and audit artifacts are removed after the test.
- Payroll smoke coverage now also verifies recurring-payee termination: a reason and valid end date are required, the termination is audited, and the end-dated payee is excluded from a later payroll run. Its temporary payee, run, lines, and audit events are removed after the test.
- Production smoke coverage now rejects zero-unit electricity top-ups and verifies each valid top-up calculates its unit cost, creates the linked production-electricity expense, and records an audit event. Temporary records are removed after execution.
- Expense-import smoke coverage now proves invalid CSV rows remain preview-only and valid CSV rows commit with the expected total, references, per-row audit records, and cleanup of the generated expenses and import audit event.
- The optional business-viewer write-guard acceptance test was run against the development database and now completes in the suite: production electricity top-up creation is correctly denied with HTTP 403 for that role.
- Printable management and finance KPI grids now use one summary-card component. Their metric definitions and values remain explicitly assembled in ReportsPage, preserving current report calculations and print output.
- The Reading workspace run snapshot is now a dedicated presentation component. Eligibility, table filters, source-reading checks, and pending-review calculations remain page-owned.
- Direct-expense smoke coverage now rejects a zero amount and verifies a valid operating expense retains its financial fields and immutable creation audit record. Test data is removed after execution.
- The primary meter-reading entry form is now a dedicated callback-only component. ReadingsPage retains customer/meter context loading, period restrictions, form state, validation, submission, and audit behavior, while the form presents the daily field workflow.
- Meter registration is now a dedicated setup-form component. The page still enforces the existing administrator/accountant role gate and owns all meter-creation state and mutation behavior.
- Meter replacement now uses a focused presentation component. Replacement context, closed-period reason requirements, state changes, and the auditable replacement mutation remain in ReadingsPage.
- The reading CSV import panel is now isolated from its page state. Template download, file loading, preview reset, correction reason, validation gate, and the explicit commit action retain their existing guarded behavior in ReadingsPage.
- Source-side meter entry, variance comparison, fallback-bill review, and bill-promotion controls now share a dedicated panel. ReadingsPage retains workspace loading, source-reading context, closed-period restrictions, review dialogs, approval mutations, and payment-bill promotion behavior.
- Meter-event editing and register filtering are now isolated in a dedicated component; audited event loading, edit state, and update submission stay page-owned. The selected-period reading-gap queue is likewise a small presentation component with its customer-selection callback retained by ReadingsPage.
- Recent-reading register presentation is now isolated while its customer/date filters, table search state, export scope, and audited edit callback remain in ReadingsPage. This keeps the run snapshot and export output aligned with the active operational filters.
- CSV preview rendering is now a focused component. Reading CSV text, file loading, validation preview requests, correction reasons, and the guarded commit mutation remain page-owned.
- Production electricity top-up entry is now a focused component. ProductionPage retains role gating, scoped draft state, the auditable top-up mutation, and the linked operating-expense behavior.
- Production source-meter setup and replacement forms are now dedicated components. ProductionPage retains customer-source meter discovery, draft lifecycle, permissions, API mutations, and the auditable replacement/posting workflow.
- Weekly production reading entry is now a dedicated component. ProductionPage retains source-reading context, controlled row state, correction reason requirements, weekly recalculation/rollback rules, and the auditable save mutation.
- Production meter, electricity top-up, and weekly-history registers now share a dedicated presentation panel. Their source tables, permissions, table-filter state, and edit/replacement/correction/rollback actions remain page-owned.
- The on-screen production report is now a dedicated component. ProductionPage retains report loading, all period and meter filtering calculations, selected-week state, report totals, and print orchestration while the panel renders the operational report drill-down.
- Printable production reporting is now a dedicated surface. ProductionPage retains business/report state and print orchestration; the component renders the business identity, selected-meter context, and summary/detail print layouts from the same derived report rows.
- Browser-generated PDF and print output now share an A4 financial-document treatment: compact margins, strong business/document hierarchy, repeatable table headers, accessible printed color treatment, restrained row banding, and controlled page-break behavior. It applies across receipts, invoices, statements, operational reports, and production reports without changing their values or export rules.
- Portal statement downloads now use a structured direct-PDF renderer rather than a plain text line dump. It preserves the selected statement period and balances while adding a branded header, account context, paginated ledger columns, alternating row treatment, adaptive print-size widths, closing totals, and page numbers.
- Bills and payment receipts now share a reusable document header that presents business identity, document type, number, and key date consistently in screen print and browser-PDF output.
- Customer portal and staff customer-statement print views now use that shared header, preventing business identity and document-context drift across self-service and internal outputs.
- The normal current-database smoke suite now includes structural regression checks for branded bill, receipt, and payslip PDF attachments, including PDF integrity, configured page geometry, and key financial document content.
- Manual payment adjustment entry is now a dedicated presentation component. PaymentsPage retains the controlled draft, permission-aware submission, approval queue, and auditable mutation behavior.
- Reconciliation row matching is now an isolated payment component. PaymentsPage continues to own statement parsing, conservative candidate creation, operator edits, validation, and the final append-only import decision.
- Reconciliation validation and import-review presentation is also isolated, while the parent continues to own import preview requests, source integrity checks, confirmation state, and the final posting action.
- Reconciliation source and column-mapping presentation are isolated components; PaymentsPage retains the statement/profile state, parsing, mappings, and explicit stage transitions.
- Prepared reconciliation history is now rendered independently from its local draft storage and append-only import workflow.
- The reconciliation workspace now owns its staged source, mapping, match-review, validation, and prepared-history presentation. PaymentsPage retains the scoped draft, statement parsing, mapping profiles, conservative candidate generation, validation requests, and final append-only import decision.
- Management and finance report panels now share a heading component for their consistent print action and spreadsheet cue; report calculations, tables, and print scope remain page-owned.
- Cash- and accrual-basis profit statements use that same heading with their compact layout, keeping individual print affordances aligned with the wider report catalog.
- Compact contractor-payable subreports now also use the common heading without adding print controls where none existed.
- Cash and accrual profit-statement presentation is now isolated from ReportsPage. The page continues to load data, calculate report values, and own print orchestration.
- Contractor-payables presentation is isolated from ReportsPage. The page continues to calculate the status/aging totals and controls which finance report is active or printed.
- Billing, aging, collections, and route-reading management reports now share a dedicated renderer; selection and print scope remain explicit in ReportsPage.
- Maintenance status, category, zone, and assignment management reports now share a focused renderer while ReportsPage retains data preparation and report/print state.
- Searchable client-finance and customer-balance report layouts are now isolated while retaining their page-owned filter, pagination, totals, and print behavior.
- Accountant billing-status, collections-channel, and billing-zone report layouts now share a revenue-control renderer; the reporting period, calculations, and print selection remain page-owned.
- Searchable billing register, service-charge, and meter-consumption comparison layouts now share a billing-operations renderer while report data, totals, filters, and printing remain page-owned.
- Receipt register, allocation-ledger, and receivables-aging report layouts now share a collections-control renderer while their reconciliation data, filters, totals, and print state remain page-owned.
- Deposit register, expense-category, and expense-register layouts now share a close-support renderer while their data, table controls, totals, and print state remain page-owned.
- Contractor balance and contractor-invoice ledger layouts now share a focused renderer while their filter controls, totals, and print state remain page-owned.
- Customer statement preview and printable statement surfaces now share a dedicated workspace; CustomersPage retains the selected customer, dates, statement request, and print orchestration.
- Customer service-charge entry and register presentation now share a dedicated panel. CustomersPage retains the selected customer, charge draft, API mutations, review confirmation, and audit behavior.
- Customer CSV import and opening-balance overwrite workspaces now share a dedicated UI component. CustomersPage retains file parsing, validation previews, commit guards, and the append/update behavior.
- Customer account closure now uses a dedicated workspace. CustomersPage retains the close-account mutation, deposit settlement defaults, refresh behavior, and account-level audit trail.
- Customer closure now pauses at a final settlement review, showing debt, deposit application, remainder disposition, inactive-service consequence, and closure-bill record. The close endpoint requires an approval note and retains it across the closure audit and any resulting settlement records.
- Customer registration and the filtered customer register now share a dedicated operational workspace. CustomersPage retains validation, duplicate-account protection, customer mutations, selection, service actions, exports, and table state.
- Customer-portal account metrics, plan standing, usage/payment trends, benchmark, and account summary now share a focused snapshot component; PortalPage retains account switching, portal data loading, and the self-service actions.
- Customer portal delivery-preference and statement presentation now use dedicated workspaces. PortalPage retains scoped preference updates, statement loading, and the direct branded PDF/print actions.
- Customer meter-reading submission, review-status register, and customer-scoped evidence workspace now share a dedicated component. PortalPage retains the submission state, validation, customer scoping, and review-safe API interaction.
- Customer portal service-request capture, request history, evidence access, and customer-safe outcome detail now share a dedicated workspace. PortalPage retains the structured request state, validation, account scoping, submission mutation, and refresh behavior.
- Direct M-Pesa receipt posting now requires both the private callback token and a configured business paybill. The integration status exposes each readiness condition separately, and callback posting remains unavailable until both are present.
- Guarded M-Pesa callback posting now also requires the provider shortcode and an exact match to the configured business paybill, preventing a token-authenticated but incomplete callback from becoming a receipt.
- Development smoke coverage rejects both missing and mismatched M-Pesa callback shortcodes before receipt posting, and removes its temporary callback audit events after verification.
- Billing smoke coverage now verifies source-billing review controls: rejection requires notes, approved source bills are created as held, repeated reviews are rejected, both decisions are audited, and all isolated fixture records are removed after the test.
- Billing smoke coverage now verifies penalty correction controls: waiver and re-application both require reasons, repeated waivers are rejected, bill total/penalty/balance figures are restored correctly, and both changes are audited with temporary fixtures removed afterward.
- Penalty automation now requires an explicit review step before a previewed bulk run can be applied. The review shows eligible bills, total penalty value, month, mode, and requires an application reason for the audit trail.
- Business operations readiness is now a dedicated workspace for monitoring, scheduled-reminder control, backup exports, and restore-drill records. BusinessSettingsPage retains role checks, data loading, API mutations, and toast feedback, while the workspace keeps the operating controls coherent and independently maintainable.
- Scheduled operational reminders now open an explicit review gate before delivery. It lists the reminder groups due today and their pending workload, prevents action when nothing is due, preserves the existing duplicate-delivery protection, and retains the review if processing fails.
- Smoke coverage now verifies that operational reminder previews and logs remain available to administrators/accountants, return the review-dialog data contract, and stay unavailable to meter readers without invoking reminder delivery.
- Reading anomaly reviews now carry their variance evidence into the edit form and require an anomaly review note before saving. Estimated-reading suggestions retain their historical basis in the entry form, require a persisted field-verification note, and remain an operator-verified, non-automatic suggestion.
- Smoke coverage now creates an isolated estimated-reading fixture to confirm field-verification notes survive creation, register retrieval, and reading audit capture before removing its temporary financial and meter records.
- Extracted the guarded source-billing approval and bill-promotion dialogs from the readings workspace, keeping the operational page focused on triage while retaining review reasons and busy-state safeguards.
- Payment-plan activation now uses a final approval review that fixes the account, repayment terms, first due date, linked customer proposal, and required audit note before an active arrangement is created.
- Collections now detects an account's active payment plan before opening a new customer proposal, directing staff to resolve the existing arrangement rather than letting them reach a rejected duplicate approval.
- Standing-order registration now follows the same final review pattern, preserving the mandate, expected schedule, evidence note, and explicit no-receipt effect before it is saved for bank matching.
- Payment-plan outcomes and standing-order status changes now also use a final review summary, keeping closure/status notes visible before a collections state transition is recorded.
- Cash-office receipt posting and payment corrections now stop at a final allocation review. The review freezes customer, amount due, allocation, credit remainder, channel, date, reference, and correction reason before the existing idempotent payment mutation runs.
- Manual credit/debit decisions now require an explicit review dialog and audit note. Approval states whether it will create an allocated adjustment receipt or a debit bill; rejection confirms that no financial record will be created.
- Contractor invoice approval, rejection, and expense posting now require an explicit final review. The dialog shows supplier, invoice, amount, timing, and each accounting consequence; server-side note requirements preserve the audit control for API callers as well.
- Payroll approval, expense-posting payment, and locking now use a final run review. Approval and payment posting require server-enforced notes; the paid review makes its linked operating-expense effect explicit without representing a bank or M-Pesa transfer.
- Direct operating expenses now pause at a final finance review that fixes the accounting fields and clearly distinguishes ledger recording from payment initiation. The direct-expense endpoint rejects missing approval notes and records the supplied note in its audit event.
- Expense CSV imports now retain their preview as a final batch review: the operator sees valid and invalid row counts, total value, and a no-payment consequence before a required approval note permits any ledger rows to be created.
- Electricity top-ups now use a final production-cost review before creating the top-up and its linked operating expense. The API requires the same finance approval note, while the review makes the reporting and no-payment effects explicit.
- Maintenance expenses now pause at a final finance review that fixes the field request and accounting details before creating the linked operating expense. The API rejects missing approval notes and records the decision basis in both expense and maintenance-request audits.
- Tariff creation, tariff edits, and block-rate changes now pause at a pricing review that makes effective date and future-billing consequences explicit. Every pricing mutation requires an approval note and preserves it in the rate audit event.
- Billing settings now use a dedicated configuration review before changing penalty rules, deposit defaults, or document-number allocation. The singleton settings endpoint rejects missing approval notes and records the decision basis in its audit event.
- Opening or upserting a billing period now starts with a dedicated cycle review. It exposes the derived monthly, close, and due dates; requires an approval note; and makes clear that no bill, penalty, balance, or delivery operation runs merely from opening the period.
- Billing-period closing and locking now require an explicit month-end approval note in addition to existing readiness checks. Where blockers are overridden, the approval and override basis are both retained in the period-status audit event.
- Customer service charges now use a final finance review before creating their linked payable bill. The server rejects missing approval notes and retains the decision basis in both service-charge and bill audit records.
- Customer account setup now pauses at a review that fixes tariff, deposit, opening-balance, migration-bill, and notification consequences. Financial account changes use the same control, while contact and delivery-preference updates remain direct; required approval notes are retained in customer and migration-bill audits.
- Permanent customer deletion now uses an explicit destructive-action review with a required approval note. It directs staff to account closure for history preservation and retains the existing linked-data protections rather than implying that financial records are removed or reversed.
- Customer and opening-balance CSV commits now pause at a final import review. Both endpoints require a retained approval note; the review fixes batch counts, opening-balance totals, migration-bill consequences, and the fact that the import does not post a payment or send notifications.

## Important Migration Notes

Latest known migration chain reaches:

```text
068_integration_commissioning_checks.sql
```

Use the tracked migration runner for ongoing upgrades:

```powershell
cd server
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

## Current Remaining Work

- External dependency: live-test SMTP, SMS, and WhatsApp providers with production credentials and approved sandbox recipients.
- External dependency: add direct M-Pesa/paybill provider integration and settlement reconciliation after provider onboarding, callback credentials, and settlement-feed access are available.
- External dependency: add a bank feed beyond PDF/CSV statement reconciliation after the bank supplies an API, host-to-host, or SFTP contract and test feed.
- Completed module: automated high-risk workflow coverage. The development smoke suite exercises billing-period/source-billing/penalty controls, field-reading verification, idempotent payment and allocation correction, payroll approval and expense posting, production top-ups, import validation and commitment, and immutable correction/exclusion audit trails. Isolated fixtures clean up their records; the optional business-viewer write guard remains deliberately opt-in for disposable environments.
- Completed module: role-by-role acceptance. The embedded-browser pass verified the navigation and decision surfaces for administrator, accountant, meter reader, customer portal, and business viewer workspaces; the restored `viewer@agua.local` development fixture also confirms the read-only management scope.
- External dependency: enable provider-native PostgreSQL point-in-time recovery/read replicas once the production database plan and hosting control-plane access are selected.
- External dependency: configure a third-party uptime check against `/api/status` once the public deployment URL, monitoring provider, alert recipients, and response-time threshold are confirmed.
- Completed module: integration readiness console. Business Settings now reports redacted email, SMS, WhatsApp, M-Pesa callback, bank-feed, public-status, and externally managed resilience readiness so commissioning work has one administrative starting point without exposing provider credentials.
- Completed module: commissioning evidence register. Administrators record audited provider and hosting outcomes with a verification date, evidence reference, findings, and follow-up action; accountant and business-viewer roles can review the register and operational backups retain it.
- Completed module: commissioning packet. Operations Readiness exports redacted configuration status, completion gates, and the latest auditable evidence per dependency for provider and hosting handover.
- Completed module: production-host setup guide. Operations Readiness lists only deployment variable names, redacted runtime status, and provider-specific commissioning steps, with a handover checklist export; integration values remain exclusively in the production host secret manager.
- Completed module: commissioning handover printout. The existing browser-PDF system now produces a branded, redacted provider and hosting handover with evidence, completion gates, runtime status, and host variable names only.
- Completed module: monitoring-event resolution. Administrators can now close reviewed warning, error, and critical system events with a required note and immutable audit entry; oversight roles remain read-only, while 24-hour error history stays visible after resolution.
- Completed module: release-preflight verification. The Vercel release helper now rejects malformed health payloads, a degraded API/database status, invalid response-time data, and an unexpected client shell while keeping production variables in the host secret manager.
- Completed module: workspace navigation shell. The compact rail now exposes seven operational workspaces instead of the full module list; each workspace provides contextual module navigation, and role-aware default homes open the most relevant operational surface after sign-in or context switching.
- Completed module: Today command center. Work is ranked by severity, financial exposure, workload, service risk, and recovery blockers; the central queue defaults to the seven highest-impact decisions, while the operational signal rail explains the next recovery actions and links them to their focused work surfaces.
- Completed module: Customer 360 record workspace. Authorised customer search now opens a stable account view with permanent identity and service context, top-level balance and meter signals, a timeline spanning bills, receipts, readings, and service work, focused evidence tabs, and a contextual action drawer that preserves the existing reviewed account-change workflows.
- Completed slice: Customer 360 operational handoffs. The account drawer now starts a customer-prefilled payment, billable reading, or service-request workflow and keeps an explicit return-to-account action available at each destination. Each destination retains its own review and confirmation controls; returning reloads the same account record instead of leaving staff in an unscoped register.
- Completed module: Billing Cycle operating pipeline. The selected period now runs through owned reading, validation, bill-release, delivery, and close-control lanes, each with current completion evidence, gate explanation, and one recovery action. Pipeline routes carry the selected billing period into the readings workspace, preserving the month-end date and outstanding-account queue.
- Completed module: Billing Cycle stage evidence. Validation opens a read-only current-period view of anomalies, estimate candidates, and pending source-billing reviews; invoice delivery opens only the selected period's bill-delivery exceptions. Each handoff preserves period context and routes to the existing controlled decision surface, with no automatic reading creation, bill mutation, or message resend.
- Completed module: Global command search coverage. Authorised users can now open customer records, bills, receipts, current meter-reading work, registered meter context, and active field tasks directly from the persistent command surface. Results route into the relevant focused workspace without mutating operational or financial records.
- Completed slice: Billing Cycle arrears penalty review. The period pipeline now exposes the active penalty policy and routes authorised staff into a read-only candidate preview. Opening the review cannot apply a penalty; application remains a separate reasoned, audited confirmation in the existing billing controls.
- Completed slice: safe workflow resume. Payment reconciliation and batch-reading drafts already retain prepared import work locally; source-side billing entry now also retains the selected meter, value, and review notes by signed-in workspace. Clearing or submitting the entry removes the draft, and no reading, bill, or approval is created until the existing explicit workflow action is confirmed.
- Completed slice: Customer 360 role boundary verification. Admins and accountants retain the full finance account workspace; meter readers and business viewers receive only their authorised narrower customer records; customer users stay within their linked portal account dashboard. Automated coverage now rejects Customer 360 financial evidence outside its authorised roles.
- Completed slice: billing-period state verification. The smoke suite now covers an open period with readiness blockers, a reasoned and audited close override, held source bills as explicit partially issued close blockers, and locked-period correction requirements. The manual billing checklist retains the full UI confirmation path for release and final lock review.
- Completed slice: Today business control strip. The command center now presents only nine decision-driving measures in one compact, role-aware strip: collection rate, arrears exposure, reading completion, billing blockers, delivery failures, output-to-billed variance, maintenance turnaround, operating liabilities, and accrual margin. Each authorised drill-down opens the recovery workspace without changing business or financial records; definitions disclose the calculation and scope.
- Completed slice: shareable workspace routes. The application now persists authorised workspace, focused queue, and record context in stable hash routes such as `#/collections?focus=arrears`. Direct links restore after sign-in and page reload, browser back/forward restores route state, and clearing a focus removes its URL parameters. Route serialization excludes labels and object snapshots while preserving safe account-return context.
- Completed slice: workspace recovery states. Today, Collections, Customers, Billing Cycle, Field Operations readings, and the Cash Office now expose a shared loading and failure surface with an explicit retry that only re-fetches workspace data. The application error boundary also offers a page reload command. Existing review, approval, and financial actions remain separate and are never re-run by a workspace retry.
- Completed slice: Finance reporting recovery. Management reporting now has a distinct initial loading and retry surface for its required operational summary, while optional forecast, budget, quality, and branding data can remain unavailable without blanking the core report. Accountant reporting has its own period-scoped loading and retry surface; a failed refresh retains the last valid report catalog and identifies it as not refreshed.
- Completed slice: Field Operations maintenance recovery. The maintenance workspace now loads its request register and required customer, zone, and assignee references as one recoverable operational surface. Retry re-fetches only that read data; dispatch, resolution, cancellation, documents, and expense actions remain independently reviewed workflows.
- Completed slice: Field Operations production recovery. Production control now has a shared loading and retry surface for source meters, weekly production readings, electricity top-ups, and loss-report inputs. Retry is read-only; meter changes, top-up expense recording, weekly-reading corrections, and rollbacks retain their separate controlled actions.
- Completed slice: Finance expense recovery. The direct operating-expense ledger now exposes an initial loading and retry state for finance staff. Retry only re-fetches the ledger and never creates an expense, commits a CSV batch, or alters supporting-document evidence; those remain explicit reviewed actions.
- Completed slice: Finance payroll recovery. Payroll control now exposes a recoverable initial state for payees, available runs, and the selected run's line items. Retry is read-only; payee changes, run approval, expense posting, locking, and termination retain their separate review controls.
- Completed slice: Finance supplier-payables recovery. Contractor records and supplier invoices now load through a recoverable workspace state. Retry does not create, approve, reject, or post invoices to expenses; each remains a deliberate audited action.
- Completed slice: Customer communications recovery. Invoice-alert readiness now has a clear initial loading, failure, and read-only retry state. Campaign history, templates, and specialized recovery queues retain scoped error handling, so an optional dataset failure does not hide the primary delivery queue; sending remains a deliberate reviewed action.
- Completed slice: Admin business-settings recovery. The organization, print, and operating configuration now has an initial loading, failure, and read-only retry state. Monitoring, reminders, backup evidence, and provider commissioning remain independently recoverable panels; no retry saves settings, sends reminders, or changes commissioning evidence.
- Completed slice: Admin access-control recovery. The user register and linked customer-account references now load through a clear initial loading, failure, and read-only retry state. Retry never creates users, changes access profiles, resets credentials, or locks accounts; each remains an explicit reviewed and audited action.
- Completed slice: Admin operational-audit recovery. The accountability and import-event register now has initial loading, failure, and read-only retry handling. Retry never modifies event history; exports and event-detail inspection remain available only after the register has loaded.
- Completed slice: Admin reference-data recovery. Tariff control and field coverage now expose initial loading, failure, and read-only retry states for their pricing and location registers. Retries never create, update, activate, or deactivate a tariff or zone; those remain deliberate review-and-approval actions.
- Completed slice: Admin knowledge-base recovery. The role-scoped operational document register now has initial loading, failure, and read-only retry handling. Retry only reloads available documents; upload, metadata edits, archival, and downloads retain their existing explicit controls.
- Completed slice: Customer portal recovery. The linked-account dashboard now has initial loading, failure, and read-only retry states for account, billing, receipt, and service activity. Retry never submits a reading or request, changes delivery preferences, or generates a payment action; those remain explicit customer choices.
- Completed slice: Billing revenue-register recovery. Issued bills, receivable balances, and payment status now have initial loading, failure, and read-only retry handling. Status filters retain their scoped refresh path; print, delivery, and payment-status corrections remain controlled actions.
- Completed milestone: primary workspace recovery coverage. Every internal operational workspace plus the customer portal and revenue register now has a route-level loading, empty, failure, permission-boundary, and read-only retry path; public and authentication routes retain their dedicated session/error handling.
- Completed QA slice: narrow-screen workflow verification. The customer portal and Cash Office were checked in the embedded browser at a 390px viewport. The portal account summary, delivery controls, and statement actions stack without overlap; the Cash Office retains a sequential payment flow, bounded customer selection, and collapsed secondary workspaces. No responsive correction was required from this pass.
- Completed module: Collections workbench. The arrears queue now keeps priority bands, top exposure, contact readiness, the selected account brief, compliant payment/reminder/customer actions, payment-plan proposals, and mandate performance together. Delivery failures and held suspense now appear as account-linked recovery lanes and hand off to the existing document-recovery and suspense-resolution queues without sending a message or changing financial data automatically.
- Field Operations core complete: mobile route dispatch, reviewed field visits, local resolution-note and batch-reading drafts, reconnect safeguards, meter scan/manual lookup, meter replacement, and route/customer access context are in place. Optional geotagged photo evidence remains intentionally open until consent, retention, and field-device policy are agreed.
- Completed slice: Today business-health metric basis. Operators can open a concise metric sheet from the command center to see each displayed measure's formula, time period, owner, actual-versus-target scope, exclusions, and exact recovery drill-down. The catalog is retained in `docs/15-management-metric-catalog.md`.
- Completed slice: Management report metric basis. Production output-to-billed variance uses the selected report period's saved weekly production readings and issued bill units; maintenance turnaround remains explicitly historical; approved payroll and supplier exposure remain separate liability measures. Each definition discloses its scope and opens the relevant operating surface without creating a financial action.
- Completed slice: Today operational watch. Current-month production variance, maintenance turnaround, approved payroll liability, and open contractor exposure now appear as a compact control strip beside the action queue. Each measure follows the documented formula, remains read-only for viewers, and opens the relevant recovery workspace only for authorised operators.
- Completed module: communication retry and opt-out policy. Automatic retries are disabled; recovery queues distinguish provider/contact failures from customer-disabled channels, prescribe one deliberate resend only after review, and route opted-out channels to customer preference repair instead of a resend action.
- Supporting documents now use PostgreSQL binary storage for Vercel-safe production persistence, with a 3MB upload limit.
- Completed slice: client recovery-contract tests. Introduced a lightweight Vitest and Testing Library runner alongside the existing Node field-dispatch tests. The shared workspace-state contract now verifies loading semantics, accessible failure signalling, and deliberate retry handling used across the primary workspaces.
- Completed slice: payment-entry contract tests. Added client-side coverage for amount allocation previews, M-Pesa reference gating, correction audit reasons, and explicit allocation-review confirmation. These UI guards supplement the existing server payment idempotency and allocation smoke coverage.
- Completed slice: billing-cycle control tests. Added client-side coverage for the monthly readiness board: incomplete reading gates route staff to field work, clean cycles only request an explicit finance close, and locked periods retain review-only controls.
- Completed slice: meter-reading review tests. Added client-side coverage that anomaly rows are review-only until staff open one deliberately, and that estimated or anomalous readings need documented field evidence before the entry form can submit.
- Completed slice: collections-recovery tests. Added client-side coverage that recovery lanes surface delivery and held-suspense evidence without mutating it, exclude resolved suspense, and route staff into Customer 360 or Cash Office review instead.
- Completed slice: customer-portal safeguards. Added client-side coverage for connection requests requiring a site location and supporting details before intake, for customer meter readings remaining review submissions with no submit option until an active meter is available, and for Customer 360 carrying account context into downstream payment and reading workflows while exposing delivery repair when contact data is incomplete.
- Completed slice: finance and management-reporting tests. Added client-side coverage for metric formula and scope disclosure, explicit metric drill-down, withholding production variance when source data is absent, and separate revenue, expense, margin, and disclosure presentation in operating statements.
- Completed module: communication recovery and integration commissioning tests. Added client-side coverage that readiness screens expose redacted evidence rather than provider secrets, passed checks need an explicit reviewed evidence record, and opted-out campaign recipients route to account-preference repair without an automatic retry or resend control.
- Completed QA slice: communications and administration interaction verification. The embedded browser confirmed the compact seven-workspace rail, command palette focus and dismissal, contextual Admin navigation, redacted integration-readiness evidence, and keyboard dismissal of the commissioning review dialog. No state-changing commissioning record was submitted during this check.
- Completed checklist audit: business-metric coverage and durable development scenarios. The Today strip, Collections workbench, billing and field queues, and Finance reports collectively surface the documented collection, arrears, exposure, route/zone reading, billing, delivery, production, service, liability, and margin signals. The guarded, idempotent `DEV-*` scenario pack supplies paid/healthy, at-risk, blocked, and high-exposure states across those workflows.
- Completed slice: controlled automation regression coverage. Penalty candidates and estimated-reading suggestions are now covered as read-only decision support. They only open the existing reviewed workflow; they cannot independently create a financial application, reading, or bill. Period close continues to require an explicit finance action and audit evidence where an override is involved.
- Completed slice: shared interaction accessibility. Keyboard focus is now visibly consistent across commands, rail navigation, tabs, forms, tables, dialogs, and focused workflow actions; motion-sensitive users receive reduced animation and transition behavior without losing the operating controls.
- Completed module: visual operating system. Desktop and 390px embedded-browser QA confirm the compact rail, contextual workspace tabs, structured canvas, risk-only amber/red treatment, scrollable dense navigation, and stacked operational metrics. The main workspaces use shared tables, queues, badges, review dialogs, side drawers, and browser-PDF surfaces rather than disconnected card layouts.
- Completed release-hardening slice: outbound SMTP now requires TLS by default, accepts one validated recipient at a time, limits delivery to in-memory PDF attachments, and disables Nodemailer filesystem/URL attachment access. The optional recipient-domain allowlist supports safe live-provider commissioning without persisting secrets. The release preflight now detects `TEST_DATABASE_URL` in `server/.env`, so it runs the smoke suite instead of silently skipping it.
- Completed release QA: all 68 migrations are applied to the development database; the 50-dataset backup validation, release preflight, 74 automated checks, and client production build pass. Embedded-browser QA verified administrator sign-in, context selection, the command center, and redacted Operations Readiness. Provider configuration and live delivery remain external completion gates.
- Completed dependency-maintenance slice: upgraded Express, Morgan, Nodemailer, `qs`, and Vite to their supported advisory-fixed releases. The Express 5 compatibility pass made body access optional for bodyless portal requests; portal access remains covered by the smoke suite.

## External Completion Gates

- Messaging: provider credentials, sender identities, approved test recipients, and evidence of a delivered SMTP, SMS, and WhatsApp message.
- M-Pesa: approved provider contract, paybill/shortcode, callback secret and endpoint, test transactions, and a settlement statement that reconciles to posted receipts.
- Bank feed: bank-approved API, host-to-host, or SFTP specification; a non-production feed; and reconciliation evidence for duplicate, correction, and unmatched transactions.
- Database resilience: selected production database plan, RPO/RTO, a successful point-in-time restore, and read-replica failover evidence where the provider supports it.
- External uptime: monitor configuration, an `/api/status` check from outside the deployment, alert routing, and an exercised alert.
- Record each completed provider or hosting gate in Business Settings with its evidence reference before treating the dependency as commissioned.

## Release Log Template

Use this format for future entries:

```text
Date:
Branch/Commit:
Summary:
Files/Migrations:
Business Behavior:
Verification:
Known Follow-Up:
```
