# Core Business Model

This document defines the shared model for the next AGUA Global core business layer. It covers build-order items 1-5: billing period rules, reading visibility, meter replacement, payments/receipts, and audit trail.

## Current Foundation

The app already has a practical starter model:

- `customers` own account details, zone, rate, status, and current balance can be derived from bills.
- `rates` store the current flat customer rate.
- `zones` behave as routes/locations for customers.
- `meter_readings` store customer readings and create bills.
- `bills` store consumption, amount, due date, paid amount, and status.
- `payments` store customer payments and allocate them to unpaid bills.
- `users` provide actor identity and role-based access.

The next model should keep this foundation, but add explicit business-control records so billing, meter lifecycle, payments, and audits are predictable.

## Design Principles

- Keep billing explainable from the bill itself: period, readings, units, charges, due date, penalties, paid amount, and balance.
- Keep meter history separate from customer history so replacements do not erase prior readings.
- Keep payments as receipts plus allocations, because one payment may settle one or many bills.
- Keep audit logs append-only and generic enough to cover customers, readings, bills, payments, and settings.
- Keep tariffs simple in the UI for now, but store enough structure to support future blocks, fixed charges, VAT, fees, and exemptions.

## Proposed Core Entities

### Customers

Existing `customers` should remain the account owner.

Recommended additions:

- `deposit_amount NUMERIC(12,2) DEFAULT 0`
- `deposit_status VARCHAR(20)` such as `not_required`, `held`, `applied`, `refunded`
- `customer_type VARCHAR(40)` such as `domestic`, `commercial`, `institutional`
- `meter_id INTEGER` nullable pointer to the currently active meter, after the `meters` table exists

Business purpose:

- Deposits become visible business value rather than notes.
- Customer type prepares the tariff model without forcing advanced tariffs now.
- Active meter linkage allows replacements without losing the customer account.

### Billing Periods

New table: `billing_periods`

Suggested fields:

- `id`
- `name`, for example `May 2026`
- `period_start DATE`
- `period_end DATE`
- `closing_date DATE`
- `bill_date DATE`
- `due_date DATE`
- `status VARCHAR(20)` such as `draft`, `open`, `closed`, `locked`
- `created_by`
- `created_at`
- `updated_at`

Business purpose:

- Defines when a month is billed.
- Allows the business to close and lock a billing cycle.
- Gives reports and bills a consistent period instead of deriving everything from reading dates.

Initial rule recommendation:

- One global monthly billing period.
- Due date defaults to `bill_date + 14 days`.
- Route-specific billing can be added later by linking billing periods to zones.

### Billing Settings

New table: `billing_settings`

Suggested fields:

- `id`
- `default_due_days INTEGER DEFAULT 14`
- `penalty_grace_days INTEGER DEFAULT 0`
- `penalty_type VARCHAR(20)` such as `none`, `fixed`, `percentage`
- `penalty_value NUMERIC(12,2) DEFAULT 0`
- `deposit_required BOOLEAN DEFAULT FALSE`
- `default_deposit_amount NUMERIC(12,2) DEFAULT 0`
- `updated_by`
- `updated_at`

Business purpose:

- Gives the business one place to set billing behavior.
- Prevents penalty and due-date logic from being hard-coded in controllers.

### Meters

New table: `meters`

Suggested fields:

- `id`
- `customer_id`
- `meter_number`
- `installed_at DATE`
- `initial_reading NUMERIC(12,2) DEFAULT 0`
- `status VARCHAR(20)` such as `active`, `replaced`, `removed`, `faulty`
- `created_at`
- `updated_at`

Business purpose:

- Separates the physical meter from the customer account.
- Allows the same customer to have a clean meter history.

### Meter Events

New table: `meter_events`

Suggested fields:

- `id`
- `customer_id`
- `old_meter_id`
- `new_meter_id`
- `event_type VARCHAR(30)` such as `install`, `replacement`, `removal`, `fault`
- `event_date DATE`
- `old_final_reading NUMERIC(12,2)`
- `new_initial_reading NUMERIC(12,2)`
- `reason TEXT`
- `created_by`
- `created_at`

Business purpose:

- Provides a clear, dispute-friendly trail for replacements.
- Lets billing calculate old-meter usage plus new-meter usage in the same period if needed.

Initial replacement rule recommendation:

- Record old final reading and new initial reading.
- Current reading entry should show the latest previous reading for the active meter.
- If replacement happens mid-period, bill old meter consumption up to final reading and new meter consumption from initial reading.

### Meter Readings

Existing `meter_readings` should remain, but should be linked to meters and periods.

Recommended additions:

- `meter_id INTEGER REFERENCES meters(id)`
- `billing_period_id INTEGER REFERENCES billing_periods(id)`
- `previous_reading_value NUMERIC(12,2)` snapshot for UI/billing clarity
- `source VARCHAR(30)` such as `field`, `admin`, `import`, `portal`
- `notes TEXT`
- `updated_by`
- `updated_at`

Business purpose:

- Makes previous reading visible and stored at input time.
- Allows reading history to survive meter changes.
- Supports future CSV import and customer portal submissions.

### Bills

Existing `bills` should remain the customer-facing invoice record.

Recommended additions:

- `billing_period_id INTEGER REFERENCES billing_periods(id)`
- `bill_number VARCHAR(80) UNIQUE`
- `subtotal_amount NUMERIC(12,2)`
- `penalty_amount NUMERIC(12,2) DEFAULT 0`
- `deposit_applied_amount NUMERIC(12,2) DEFAULT 0`
- `adjustment_amount NUMERIC(12,2) DEFAULT 0`
- `total_amount NUMERIC(12,2)`
- `balance_amount NUMERIC(12,2)`
- `issued_at TIMESTAMPTZ`
- `locked_at TIMESTAMPTZ`
- status values expanded to `draft`, `issued`, `partial`, `paid`, `overdue`, `void`

Business purpose:

- Separates base water charge from penalties, deposits, and adjustments.
- Allows bills to be issued and locked.
- Makes reports and customer portal views more reliable.

Initial rule recommendation:

- Keep `amount` as the water charge for compatibility.
- Add `total_amount` and `balance_amount` for new workflows.
- Generate bill numbers when bills are issued.

### Bill Line Items

New table: `bill_line_items`

Suggested fields:

- `id`
- `bill_id`
- `line_type VARCHAR(30)` such as `water_usage`, `penalty`, `deposit`, `adjustment`, `fee`, `tax`
- `description`
- `quantity NUMERIC(12,2)`
- `unit_price NUMERIC(12,2)`
- `amount NUMERIC(12,2)`
- `created_at`

Business purpose:

- Keeps bills explainable.
- Future-proofs fixed charges, VAT, reconnection fees, exemptions, and block tariffs.

Initial rule recommendation:

- Create one `water_usage` line item per bill.
- Add penalties and deposits as separate line items only when enabled.

### Payments

Existing `payments` should evolve into receipt-level payments.

Recommended additions:

- `receipt_number VARCHAR(80) UNIQUE`
- `payment_channel VARCHAR(30)` such as `cash`, `bank`, `mpesa_paybill`, `manual_adjustment`
- `external_reference VARCHAR(120)`
- `received_from VARCHAR(160)`
- `status VARCHAR(20)` such as `posted`, `void`
- `voided_by`
- `voided_at`
- `updated_by`
- `updated_at`

Business purpose:

- Captures receipt identity and payment method clearly.
- Allows accountant reconciliation.
- Supports future M-Pesa/paybill integration.

### Payment Allocations

New table: `payment_allocations`

Suggested fields:

- `id`
- `payment_id`
- `bill_id`
- `amount NUMERIC(12,2)`
- `created_at`

Business purpose:

- One receipt can pay multiple bills.
- Bill payment history becomes easier to audit.
- Existing `payments.bill_id` can remain temporarily for compatibility, then be phased out.

Initial allocation rule recommendation:

- If no bill is selected, allocate to oldest unpaid bills first.
- If a bill is selected, allocate only to that bill.
- Do not allow overpayment until the business decides how credits should be handled.

### Audit Events

New table: `audit_events`

Suggested fields:

- `id`
- `actor_user_id`
- `action VARCHAR(80)`, for example `customer.updated`, `reading.created`, `payment.voided`
- `entity_type VARCHAR(60)`
- `entity_id INTEGER`
- `before_data JSONB`
- `after_data JSONB`
- `reason TEXT`
- `ip_address VARCHAR(80)`
- `user_agent TEXT`
- `created_at`

Business purpose:

- Tracks who changed sensitive records.
- Supports disputes, fraud checks, and management review.
- Works across all milestone 1-5 entities.

Initial audit rule recommendation:

- Audit creates, updates, deletes/voids for customers, readings, bills, payments, rates, billing settings, meters, and meter events.
- Store full JSON snapshots for simplicity and reliability.

## Core Workflows

### 1. Billing Period Setup

1. Admin/accountant creates or opens a billing period.
2. System calculates `period_start`, `period_end`, `closing_date`, `bill_date`, and `due_date`.
3. Readings entered for the period link to that billing period.
4. Bills generated for the period link to that billing period.
5. Period can be closed or locked after review.

### 2. Reading Entry

1. User selects customer.
2. System displays active meter and previous reading.
3. User enters current reading and date.
4. System validates that current reading is not below previous reading for the same active meter.
5. System snapshots previous reading on the reading record.
6. System generates or recalculates the related bill.
7. System writes an audit event.

### 3. Meter Replacement

1. User opens replacement workflow for customer.
2. System displays current active meter and latest reading.
3. User records old final reading, new meter number, new initial reading, replacement date, and reason.
4. System marks old meter as `replaced`.
5. System creates new active meter.
6. System creates a meter event.
7. Future readings use the new meter.
8. Billing can include old and new meter consumption if the replacement falls inside the same billing period.

### 4. Payment Posting

1. Accountant selects customer or enters account number.
2. System displays open bills and total balance.
3. Accountant records amount, payment channel, reference, receipt number, and payment date.
4. System allocates payment to selected bill or oldest unpaid bills.
5. System updates bill balances/statuses.
6. System writes audit events for payment and affected bills.

### 5. Audit Logging

1. Sensitive action happens inside a database transaction.
2. Before and after snapshots are captured where applicable.
3. Audit event is inserted before commit.
4. UI can later show audit history by record.

## Migration Strategy

Recommended implementation order:

1. Add `billing_periods`, `billing_settings`, and bill period fields.
2. Add `meters`, create one active meter per existing customer, and link existing readings.
3. Add previous-reading visibility fields to `meter_readings`.
4. Add payment receipt fields and `payment_allocations`.
5. Add `audit_events` and begin logging changes in each controller.

Compatibility notes:

- Preserve existing `customers.rate`, `bills.amount`, `bills.paid_amount`, and `payments.bill_id` during the first migration so current screens do not break.
- Introduce new fields gradually and update UI screens one workflow at a time.
- Avoid dropping old columns until the replacement screens and reports are stable.

## Open Business Decisions

These decisions should be confirmed while implementing the relevant milestone:

- Should billing periods be global or per zone/route?
- Should due dates be fixed monthly dates or calculated from bill date?
- Should penalties be fixed amount, percentage, or disabled at first?
- Are deposits only held as security, or can they be applied to unpaid balances?
- Should receipt numbers be manually entered, system generated, or both?
- Should overpayments be blocked or stored as customer credit?
- During meter replacement, should mid-period consumption be split on the bill or summarized as one line?

