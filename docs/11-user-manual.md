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

## Customer Portal Workflow

Customer can:

1. Log in to customer portal.
2. View dashboard summary.
3. View bills and receipts.
4. Download statement where enabled.
5. Submit service request or complaint.

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

## Payment Entry

Before posting:

- Select the correct customer.
- Confirm unpaid balance.
- Enter payment amount, method, reference, and date.
- Submit.
- Confirm receipt appears and bill status updates.

If a wrong payment was posted, use edit or void workflows.

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
- Give campaigns clear names.
- Review campaign history and recipient results.

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

Admins can review the monitoring alert snapshot and send test alerts. Admins, accountants, and business viewers can review monitoring summaries and event logs from Business Settings.

Monitoring tracks:

- API and database status.
- Failed logins.
- Server-side errors.
- Client-side page crashes reported by the app.
- Alert send and cooldown history.

The public status page shows API and database reachability without exposing operational records. It is intended for uptime checks and lightweight external visibility.

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
