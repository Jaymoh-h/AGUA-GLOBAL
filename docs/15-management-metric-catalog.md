# Management Metric Catalog

The Today business-health board uses actual operating records unless a metric explicitly identifies an approved target. A target, forecast, and actual must never be treated as interchangeable.

| Metric | Formula | Period | Owner | Drill-down | Scope and exclusions |
| --- | --- | --- | --- | --- | --- |
| Collection rate | Posted allocations against current-month payable bills / current-month payable bills issued | Current calendar month | Revenue office | Collections workbench | Held bills, unallocated credit, and preview/import rows are excluded. |
| Days sales outstanding | Open payable receivables / payable billing issued in the trailing 90 days × 90 | Rolling 90 days | Revenue office | Collections workbench | Withheld when no payable billing exists in the period. |
| Reading completion | Active client-billing accounts with a current-month reading / active client-billing accounts required to read | Current billing month | Field operations | Missing readings queue | Suggestions and unreviewed submissions do not count. |
| Billing blockers | Current-month unbilled client readings + held bills + pending source-billing reviews | Current month, with held/source-review queues | Billing review | Billing Cycle | Work count only; it is not a monetary leakage estimate. |
| Delivery reliability | Successful document deliveries / all delivery attempts | Trailing 14 days | Customer communications | Delivery exception queue | Failed and skipped outcomes remain exceptions; automatic retries are excluded. |
| Accrual margin | Current-month payable bill value − recorded operating expenses; margin is net amount / payable bill value | Current calendar month | Finance control | Financial reports | Accrual view only; unrecorded liabilities and forecasts are excluded. |
| Budget revenue | Current-month payable bill value compared with the approved monthly revenue target | Current calendar month | Finance control | Monthly budget control | The target is a separate approved planning value and does not change the actual measure. |
| Output / billed variance | Production-source consumption captured in completed weekly readings − customer bill units issued | Selected report period | Production operations | Production report | Saved production readings only. Missing weeks are not estimated; the variance is a review signal, not a confirmed leakage figure. |
| Maintenance turnaround | Average calendar days from reported date to resolved date for resolved maintenance requests | All resolved maintenance history | Field operations | Maintenance work | Open, cancelled, and unresolved requests are excluded. This shows elapsed resolution time, not SLA compliance. |
| Approved payroll liability | Net pay for payroll runs marked approved and overlapping the selected report period | Selected report period | Finance control | Payroll control | Draft, pending, paid, locked, and cancelled runs are excluded. Approval is an internal liability, not payment initiation. |
| Open contractor payables | Total contractor invoice value in draft, submitted, or approved status | Current open invoice register | Finance control | Supplier payables | Posted-to-expense, paid, rejected, and cancelled invoices are excluded. Draft/submitted invoices are exposure, not approved commitments. |
