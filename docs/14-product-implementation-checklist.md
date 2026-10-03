# Product Implementation Checklist

Use this checklist to guide the remaining product transformation. It describes the intended operating experience, not merely the existence of individual pages. A checked item requires implementation, role review, automated coverage where the risk warrants it, and embedded-browser verification.

## Working Rules

- [ ] Start each slice with one primary user, one repeated task, and one measurable business outcome.
- [ ] Preserve financial controls, audit records, permissions, and existing data while changing presentation or navigation.
- [ ] Replace module navigation only after the destination workflow is complete and reachable by URL, search, and the appropriate role home screen.
- [ ] Prefer a queue, pipeline, or record view over a dashboard-card collection when staff must make or record a decision.
- [ ] Keep all provider secrets exclusively in the production host secret manager. UI and exports may show redacted readiness and required variable names only.

## Existing Foundations

- [x] Global command search is available.
- [x] Customer 360, billing readiness, collections recovery, field dispatch, payment review, and role-aware workspaces exist as functional foundations.
- [x] Critical workflow decisions use structured review dialogs and audit records rather than browser prompts.
- [x] High-risk API smoke coverage, role checks, monitoring, readiness evidence, and release preflight tooling are in place.
- [x] PWA assets and offline fallback are present; they are not yet a complete offline field workflow.

## 1. Information Architecture And Application Shell

- [x] Replace the long top navigation with a compact vertical rail.
- [x] Make the rail expose only these workspaces: Today, Customers, Billing Cycle, Collections, Field Ops, Finance, and Admin.
- [x] Move individual modules into contextual workspace navigation, command search, and record links instead of permanent top-level icons.
- [x] Add a persistent command/search bar that can open a customer, account, bill, receipt, meter, task, or workflow action.
- [x] Add a context-aware workspace header with the active workspace and current operational module rather than generic page titles.
- [x] Define role-specific default homes: operations/admin to Today, meter readers to Reading & Meters, finance users to Collections or Finance, viewers to reports, and portal users to their account.
- [x] Keep URL routes stable and shareable for every workspace, queue filter, and record-focused view.
- [ ] Verify keyboard navigation, narrow-screen behavior, focus handling, and navigation state for each role.

## 2. Today Command Center

- [x] Replace the dashboard-card wall with a central prioritized work queue.
- [x] Put only decision-driving signals in a slim KPI strip: collection rate, arrears exposure, reading completion, billing readiness, delivery failures, production variance, maintenance turnaround, liabilities, and operating margin.
- [x] Add a right-side operational signal panel for blockers, delivery failures, overdue work, and upcoming deadlines.
- [x] Rank work using business impact, amount at risk, service risk, and dependency blockers; show why an item is ranked.
- [x] Let every Today item open the exact filtered queue or record needed to act.
- [x] Persist personal queue density and safe presentation preferences without hiding business-critical alerts.
- [x] Test normal, blocked, and high-volume operational states with permanent development fixtures.

## 3. Customer Workspace And Customer 360

- [x] Make Customer 360 the default result for global account search for authorised finance and administrative users.
- [x] Add a permanent identity rail with account status, contact details, service zone, tariff, delivery state, and standing-order context.
- [x] Keep balance, account status, active meter, latest reading, and delivery state visible above the fold.
- [x] Present recent bills, receipts, readings, and service requests as one time-ordered activity timeline, with focused billing, service, documents, and audit tabs.
- [x] Use a contextual right-side action drawer for contact repair, statements, service charges, and account actions.
- [x] Add contextual entry actions for payment posting, reading capture, and service-request handling from the same drawer.
- [x] Ensure each action returns to the same customer context with a clear confirmation and retained filter state.
- [x] Verify staff, finance, field, viewer, and portal permissions against the same customer record model.

## 4. Billing Cycle Pipeline

- [x] Make Billing Cycle a visual operating pipeline: period setup, reading capture, billing review, release, delivery, and close/lock.
- [x] Show each stage's owner, completion evidence, gate/blocker context, and next required action.
- [x] Carry the selected period into reading-stage recovery so the route, date, and outstanding accounts stay in context.
- [x] Surface current-period reading anomalies, estimated-reading candidates, pending source-billing reviews, and delivery exceptions in their relevant pipeline stage; preserve the selected period when handing work to the controlled recovery queue.
- [x] Surface penalty policy and reviewed penalty candidates in the relevant stage without triggering automatic application.
- [x] Add save/resume state for complex billing and import work without changing financial data until final review.
- [x] Make readiness gates explain the specific missing records, values at risk, and direct recovery action.
- [x] Keep approval, release, close, and override decisions explicit, reasoned, and audited.
- [x] Verify open, blocked, partially issued, locked, and corrected-period workflows end to end.

## 5. Collections And Payment Workbench

- [x] Turn Collections into a workbench with arrears bands, top exposure, failed delivery, payment-plan, suspense, and contact-gap views in one queue system.
- [x] Keep a focused account list on the left, account context in the center, and the next compliant action in a side panel or drawer.
- [x] Let staff progress through the queue without losing filters, queue position, or customer context.
- [x] Make payment posting a dedicated focused surface: customer lookup, allocation preview, channel/reference, confirmation, and receipt output.
- [x] Keep imports and reconciliation in a guided save/resume wizard with mapping templates stored server-side.
- [x] Show clear duplicate-reference, unmatched, excluded, and correction outcomes before any financial posting.
- [x] Test cash, bank, M-Pesa, suspense, partial allocation, correction, and import exception states.

## 6. Field Operations And Mobile Use

- [x] Redesign field work around route-oriented task lists, not desktop tables compressed for phones.
- [x] Provide large, stable controls for reading entry, task status, meter replacement, evidence capture, and exception reasons.
- [x] Complete offline-friendly reading capture with local draft protection, reconnect review, duplicate prevention, and explicit sync outcomes.
- [x] Add meter barcode/QR scanning where device support is available; retain manual entry as the reliable fallback.
- [x] Add optional geotagged photo evidence with visible consent, authorized review, and a 90-day location-retention rule.
- [x] Keep route, customer access instructions, previous reading context, and open exceptions available in the field task view.
- [x] Verify touch targets, slow connections, offline/reconnect behavior, and meter-reader permissions on mobile-sized viewports.

## 7. Visual System

- [x] Apply the compact rail and structured canvas consistently before redesigning individual workflow details.
- [x] Use sharper typography, calmer dense spacing, few borders, restrained cards, and side sheets for contextual work.
- [x] Use water-blue/teal for normal operating structure and amber/red only for warning, exception, or financial/service risk.
- [x] Reserve charts and KPIs for decisions; do not create decorative dashboard cards.
- [x] Standardize tables, queues, status markers, dialogs, timeline rows, side drawers, and print surfaces.
- [x] Check desktop and mobile layouts for text overflow, cramped controls, inconsistent density, and overlapping layers.

## 8. Business Metrics And Management Signals

- [x] Define and expose the formula, time period, owner, scope, exclusions, and drill-down target for every metric shown on the Today business-health board.
- [x] Extend the same catalog treatment to report-only production variance, maintenance turnaround, and liabilities metrics.
- [x] Surface collection rate, arrears aging, top overdue exposure, reading completion by route/zone, billing readiness, production-to-billed variance, failed delivery, maintenance turnaround, payroll/contractor liabilities, and operating margin.
- [x] Make every Today business-health metric drill into its underlying work and disclose exclusions or missing data.
- [x] Prevent target, forecast, and actual figures from being visually or mathematically conflated.
- [x] Add permanent development scenarios for healthy, at-risk, blocked, and high-exposure states.

## 9. Automation And Integrations

- [x] Keep billing, estimation, penalties, and period-close recommendations controlled by explicit business rules, human review, audit notes, and reversible outcomes.
- [ ] Add live SMTP, SMS, and WhatsApp validation only after provider credentials, sender identities, and approved test recipients are available.
- [ ] Add direct Daraja/M-Pesa retrieval and settlement reconciliation only after paybill onboarding, callback credentials, and settlement-feed access are available.
- [ ] Add a bank API, host-to-host, or SFTP feed only after the bank supplies a contract and non-production test feed.
- [x] Continue to record external checks in the commissioning evidence register and export redacted handover evidence.
- [ ] Configure external uptime monitoring and production PostgreSQL recovery/failover checks through the selected providers.

## 10. Engineering Foundation

- [x] Continue decomposing PaymentsPage, ReadingsPage, ReportsPage, and any new shell workspace into domain-focused components and hooks.
- [x] Introduce TypeScript incrementally at stable shared boundaries, beginning with API contracts and workflow models.
- [x] Use explicit post-mutation server refreshes for financial workspaces; defer optimistic updates and cached financial records until their invalidation contracts are proven safe.
- [x] Bound high-volume operational registers with server-side pagination (payments and meter readings), preserving search, keyboard-accessible paging, totals, and complete exports without rendering unbounded rows.
- [x] Maintain route-level loading, empty, error, permission-denied, and retry states for every primary workspace.
- [x] Expand high-risk tests whenever a billing, payment, role, integration, or data-recovery contract changes.

## Slice Exit Criteria

- [ ] The workflow is faster or clearer for the identified user and business measure.
- [ ] Existing permissions, audit behavior, and financial controls are preserved or intentionally improved.
- [ ] The feature has focused automated coverage proportional to financial and operational risk.
- [ ] Development scenarios demonstrate meaningful normal and exception states.
- [ ] Client build and relevant API smoke tests pass.
- [ ] Embedded-browser QA confirms the rendered desktop and mobile workflow.
- [ ] User guidance and implementation records distinguish implemented behavior from external dependencies.
