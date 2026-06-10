const pool = require("../db/pool");
const { sendEmail } = require("./email.service");

const dateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

const reminderTypeLabels = {
  pending_work: "Pending work",
  meter_readings: "Meter readings",
  weekly_production_readings: "Weekly production readings",
  bill_preparation: "Bill preparation",
  contractor_invoices: "Contractor invoices",
  payroll_preparation: "Payroll preparation"
};

const currentMonth = () => new Date().toISOString().slice(0, 7);
const sendKey = (type, date = new Date()) => `${type}:${date.toISOString().slice(0, 10)}`;
const toDateOnlyUtc = (value = new Date()) => {
  const text = dateOnly(value);
  return new Date(`${text}T00:00:00.000Z`);
};
const addDays = (value, days) => {
  const date = toDateOnlyUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const daysBetween = (left, right) => Math.round((toDateOnlyUtc(left) - toDateOnlyUtc(right)) / 86400000);
const monthEndDate = (value = new Date()) => {
  const date = toDateOnlyUtc(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
};
const isPayrollWindow = (value = new Date()) => toDateOnlyUtc(value).getUTCDate() >= 25;
const isWeekday = (value = new Date()) => {
  const day = toDateOnlyUtc(value).getUTCDay();
  return day >= 1 && day <= 5;
};

const weeklyReadingTargetDate = (value = new Date()) => {
  const date = toDateOnlyUtc(value);
  const day = date.getUTCDay();
  if (day === 6) return addDays(date, 2);
  if (day === 0) return addDays(date, 1);
  if (day >= 1 && day <= 3) return addDays(date, 1 - day);
  return addDays(date, day === 4 ? 4 : 3);
};

const getRecipients = async (client, roles) => {
  const { rows } = await client.query(
    `SELECT id, name, email, role
     FROM users
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND email <> ''
       AND role = ANY($1::text[])
     ORDER BY role ASC, name ASC`,
    [roles]
  );
  return rows;
};

const buildPendingWorkReminder = async (client, asOf = new Date()) => {
  const [maintenance, adjustments, suspense, sourceBilling, delivery] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) AS active_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'urgent') AS urgent_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND target_date < CURRENT_DATE) AS overdue_count
       FROM maintenance_requests`
    ),
    client.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
       FROM customer_adjustments
       WHERE status = 'pending'`
    ),
    client.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
       FROM payment_suspense_items
       WHERE status = 'held'`
    ),
    client.query(
      `SELECT COUNT(*) AS count
       FROM source_billing_requests
       WHERE status = 'pending'`
    ),
    client.query(
      `SELECT COUNT(*) AS count
       FROM document_delivery_logs
       WHERE status IN ('failed', 'skipped')
         AND created_at >= NOW() - INTERVAL '14 days'`
    )
  ]);

  const summary = {
    maintenance: maintenance.rows[0],
    pending_adjustments: adjustments.rows[0],
    suspense_payments: suspense.rows[0],
    pending_source_billing: sourceBilling.rows[0],
    delivery_exceptions_14d: delivery.rows[0]
  };
  const count =
    Number(summary.maintenance?.urgent_count || 0) +
    Number(summary.maintenance?.overdue_count || 0) +
    Number(summary.pending_adjustments?.count || 0) +
    Number(summary.suspense_payments?.count || 0) +
    Number(summary.pending_source_billing?.count || 0) +
    Number(summary.delivery_exceptions_14d?.count || 0);

  return {
    type: "pending_work",
    roles: ["admin", "accountant"],
    subject: "AGUA operational reminder: pending work needs review",
    count,
    schedule: {
      due_today: isWeekday(asOf),
      cadence: "Weekdays at 9:00 AM"
    },
    summary,
    lines: [
      `Urgent maintenance: ${Number(summary.maintenance?.urgent_count || 0).toLocaleString()}`,
      `Overdue maintenance: ${Number(summary.maintenance?.overdue_count || 0).toLocaleString()}`,
      `Pending adjustments: ${Number(summary.pending_adjustments?.count || 0).toLocaleString()} (${money(summary.pending_adjustments?.amount)})`,
      `Held suspense payments: ${Number(summary.suspense_payments?.count || 0).toLocaleString()} (${money(summary.suspense_payments?.amount)})`,
      `Pending source billing reviews: ${Number(summary.pending_source_billing?.count || 0).toLocaleString()}`,
      `Recent delivery exceptions: ${Number(summary.delivery_exceptions_14d?.count || 0).toLocaleString()}`
    ]
  };
};

const buildMeterReadingReminder = async (client, asOf = new Date()) => {
  const periodResult = await client.query(
    `SELECT *
     FROM billing_periods
     WHERE status IN ('open', 'draft')
     ORDER BY period_start DESC
     LIMIT 1`
  );
  const period = periodResult.rows[0] || null;
  if (!period) {
    return {
      type: "meter_readings",
      roles: ["admin", "accountant", "meter_reader"],
      subject: "AGUA operational reminder: no open billing period for readings",
      count: 1,
      schedule: {
        due_today: isWeekday(asOf),
        cadence: "Daily while billing setup needs attention"
      },
      summary: { period: null },
      lines: ["No open or draft billing period was found for meter reading follow-up."]
    };
  }

  const result = await client.query(
    `SELECT
       COUNT(*) AS missing_count,
       COUNT(*) FILTER (WHERE z.name IS NOT NULL) AS zoned_missing_count,
       COALESCE(json_agg(
         json_build_object('zone_name', z.name, 'missing_count', zone_missing.missing_count)
         ORDER BY zone_missing.missing_count DESC, z.name ASC
       ) FILTER (WHERE z.id IS NOT NULL), '[]'::json) AS zones
     FROM (
       SELECT c.id, c.zone_id
       FROM customers c
       WHERE c.status = 'active'
         AND EXISTS (SELECT 1 FROM meters m WHERE m.customer_id = c.id AND m.status = 'active')
         AND NOT EXISTS (
           SELECT 1
           FROM meter_readings mr
           WHERE mr.customer_id = c.id
             AND mr.reading_date >= $1::date
             AND mr.reading_date <= $2::date
         )
     ) missing
     LEFT JOIN zones z ON z.id = missing.zone_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS missing_count
       FROM customers c2
       WHERE c2.zone_id = z.id
         AND c2.status = 'active'
         AND EXISTS (SELECT 1 FROM meters m2 WHERE m2.customer_id = c2.id AND m2.status = 'active')
         AND NOT EXISTS (
           SELECT 1
           FROM meter_readings mr2
           WHERE mr2.customer_id = c2.id
             AND mr2.reading_date >= $1::date
             AND mr2.reading_date <= $2::date
         )
     ) zone_missing ON TRUE
     GROUP BY z.id`,
    [period.period_start, period.period_end]
  );
  const missingCount = result.rows.reduce((sum, row) => sum + Number(row.missing_count || 0), 0);
  const zones = result.rows.flatMap((row) => row.zones || []).filter((zone) => Number(zone.missing_count || 0) > 0);
  const daysUntilPeriodEnd = daysBetween(period.period_end, asOf);
  const dueToday = daysUntilPeriodEnd >= 0 && daysUntilPeriodEnd <= 7;

  return {
    type: "meter_readings",
    roles: ["admin", "accountant", "meter_reader"],
    subject: `AGUA operational reminder: meter readings for ${period.name}`,
    count: missingCount,
    schedule: {
      due_today: dueToday,
      cadence: "Daily for 7 days before the end-month reading due date",
      due_date: dateOnly(period.period_end),
      days_until_due: daysUntilPeriodEnd
    },
    summary: { period, missing_count: missingCount, zones, days_until_due: daysUntilPeriodEnd },
    lines: [
      `Period: ${period.name} (${dateOnly(period.period_start)} to ${dateOnly(period.period_end)})`,
      `Reading due date: ${dateOnly(period.period_end)} (${daysUntilPeriodEnd >= 0 ? `${daysUntilPeriodEnd} day(s) remaining` : `${Math.abs(daysUntilPeriodEnd)} day(s) overdue`})`,
      `Missing readings: ${missingCount.toLocaleString()}`,
      ...(zones.length ? zones.slice(0, 8).map((zone) => `${zone.zone_name || "Unassigned"}: ${Number(zone.missing_count || 0).toLocaleString()}`) : [])
    ]
  };
};

const buildWeeklyProductionReadingReminder = async (client, asOf = new Date()) => {
  const targetDate = weeklyReadingTargetDate(asOf);
  const offset = daysBetween(targetDate, asOf);
  const activeMetersResult = await client.query(
    `SELECT COUNT(*) AS count
     FROM production_source_meters
     WHERE status = 'active'`
  );
  const readingResult = await client.query(
    `SELECT pwr.id, pwr.reading_date, COUNT(pmr.id) AS meter_readings
     FROM production_weekly_readings pwr
     LEFT JOIN production_meter_readings pmr ON pmr.weekly_reading_id = pwr.id
     WHERE pwr.reading_date = $1::date
     GROUP BY pwr.id`,
    [dateOnly(targetDate)]
  );
  const activeMeters = Number(activeMetersResult.rows[0]?.count || 0);
  const weeklyReading = readingResult.rows[0] || null;
  const missingCount = weeklyReading ? Math.max(activeMeters - Number(weeklyReading.meter_readings || 0), 0) : activeMeters;
  const dueToday = offset >= -2 && offset <= 2 && (offset >= 0 || missingCount > 0);
  const phase = offset > 0 ? "upcoming" : offset < 0 ? "missed" : "due today";

  return {
    type: "weekly_production_readings",
    roles: ["admin", "accountant", "meter_reader"],
    subject: `AGUA operational reminder: weekly production reading ${dateOnly(targetDate)}`,
    count: missingCount,
    schedule: {
      due_today: dueToday,
      cadence: "Midday for 2 days before the weekly reading day, on the day, and 2 days after if missed",
      due_date: dateOnly(targetDate),
      days_until_due: offset
    },
    summary: {
      target_date: dateOnly(targetDate),
      active_source_meters: activeMeters,
      reading_exists: Boolean(weeklyReading),
      missing_meter_readings: missingCount,
      phase
    },
    lines: [
      `Target reading date: ${dateOnly(targetDate)} (${phase})`,
      `Active source meters: ${activeMeters.toLocaleString()}`,
      `Missing weekly meter details: ${missingCount.toLocaleString()}`
    ]
  };
};

const buildBillPreparationReminder = async (client, asOf = new Date()) => {
  const periodResult = await client.query(
    `SELECT *
     FROM billing_periods
     WHERE status IN ('open', 'draft')
     ORDER BY period_start DESC
     LIMIT 1`
  );
  const period = periodResult.rows[0] || null;
  if (!period) {
    return {
      type: "bill_preparation",
      roles: ["admin", "accountant"],
      subject: "AGUA operational reminder: billing period setup needed",
      count: 1,
      schedule: {
        due_today: isWeekday(asOf),
        cadence: "Weekdays at 8:30 AM while billing setup needs attention"
      },
      summary: { period: null },
      lines: ["No open or draft billing period was found for bill preparation."]
    };
  }

  const result = await client.query(
    `SELECT
       COUNT(b.id) FILTER (WHERE b.bill_pay_status = 'payable') AS payable_bills,
       COALESCE(SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount)) FILTER (WHERE b.bill_pay_status = 'payable'), 0) AS billed_amount,
       COUNT(mr.id) FILTER (WHERE mr.previous_reading_id IS NOT NULL AND b.id IS NULL) AS readings_without_bills,
       COUNT(sbr.id) FILTER (WHERE sbr.status = 'pending') AS pending_source_reviews
     FROM billing_periods bp
     LEFT JOIN bills b ON b.billing_period_id = bp.id
     LEFT JOIN meter_readings mr ON mr.billing_period_id = bp.id
     LEFT JOIN source_billing_requests sbr ON sbr.billing_period_id = bp.id
     WHERE bp.id = $1
     GROUP BY bp.id`,
    [period.id]
  );
  const row = result.rows[0] || {};
  const count =
    (Number(row.payable_bills || 0) === 0 ? 1 : 0) +
    Number(row.readings_without_bills || 0) +
    Number(row.pending_source_reviews || 0);

  return {
    type: "bill_preparation",
    roles: ["admin", "accountant"],
    subject: `AGUA operational reminder: bill preparation for ${period.name}`,
    count,
    schedule: {
      due_today: isWeekday(asOf),
      cadence: "Weekdays at 8:30 AM while bill preparation needs attention"
    },
    summary: { period, ...row },
    lines: [
      `Period: ${period.name}`,
      `Payable bills: ${Number(row.payable_bills || 0).toLocaleString()}`,
      `Billed amount: ${money(row.billed_amount)}`,
      `Readings without bills: ${Number(row.readings_without_bills || 0).toLocaleString()}`,
      `Pending source reviews: ${Number(row.pending_source_reviews || 0).toLocaleString()}`
    ]
  };
};

const buildContractorInvoiceReminder = async (client, asOf = new Date()) => {
  const result = await client.query(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(total_amount), 0) AS amount,
       COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_count,
       COALESCE(SUM(total_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS overdue_amount,
       COALESCE(json_agg(
         json_build_object(
           'invoice_number', ci.invoice_number,
           'contractor_name', c.name,
           'status', ci.status,
           'due_date', ci.due_date,
           'total_amount', ci.total_amount
         )
         ORDER BY ci.due_date ASC, ci.id ASC
       ) FILTER (WHERE ci.id IS NOT NULL), '[]'::json) AS invoices
     FROM contractor_invoices ci
     JOIN contractors c ON c.id = ci.contractor_id
     WHERE ci.status NOT IN ('posted_to_expense', 'paid', 'rejected')`
  );
  const row = result.rows[0] || {};
  const count = Number(row.count || 0);

  return {
    type: "contractor_invoices",
    roles: ["admin", "accountant"],
    subject: "AGUA operational reminder: contractor invoices need posting or payment",
    count,
    schedule: {
      due_today: true,
      cadence: "Daily while invoices are not posted to expense or paid"
    },
    summary: row,
    lines: [
      `Open contractor invoices: ${count.toLocaleString()} (${money(row.amount)})`,
      `Overdue invoices: ${Number(row.overdue_count || 0).toLocaleString()} (${money(row.overdue_amount)})`,
      ...((row.invoices || []).slice(0, 8).map(
        (invoice) =>
          `${invoice.contractor_name} - ${invoice.invoice_number}: ${money(invoice.total_amount)} due ${dateOnly(invoice.due_date)} (${invoice.status})`
      ))
    ]
  };
};

const buildPayrollPreparationReminder = async (client, asOf = new Date()) => {
  const month = currentMonth();
  const result = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('draft', 'pending_approval', 'approved')) AS active_runs,
       COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_approval,
       COUNT(*) FILTER (WHERE status = 'approved') AS approved_unpaid,
       COALESCE(SUM(total_net) FILTER (WHERE status IN ('pending_approval', 'approved')), 0) AS attention_amount
     FROM payroll_runs
     WHERE to_char(period_start, 'YYYY-MM') = $1`,
    [month]
  );
  const payeeResult = await client.query(
    `SELECT COUNT(*) AS active_recurring_payees
     FROM payroll_payees
     WHERE status = 'active'
       AND recurrence_type = 'recurring'
       AND start_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)`
  );
  const row = result.rows[0] || {};
  const payees = Number(payeeResult.rows[0]?.active_recurring_payees || 0);
  const count = (payees > 0 && Number(row.active_runs || 0) === 0 ? 1 : 0) + Number(row.pending_approval || 0) + Number(row.approved_unpaid || 0);

  return {
    type: "payroll_preparation",
    roles: ["admin", "accountant"],
    subject: `AGUA operational reminder: payroll preparation for ${month}`,
    count,
    schedule: {
      due_today: isPayrollWindow(asOf),
      cadence: "Daily from the 25th through month end while payroll needs preparation or approval"
    },
    summary: { month, active_recurring_payees: payees, ...row },
    lines: [
      `Month: ${month}`,
      `Active recurring payees: ${payees.toLocaleString()}`,
      `Active payroll runs: ${Number(row.active_runs || 0).toLocaleString()}`,
      `Pending approval: ${Number(row.pending_approval || 0).toLocaleString()}`,
      `Approved but unpaid: ${Number(row.approved_unpaid || 0).toLocaleString()}`,
      `Amount needing attention: ${money(row.attention_amount)}`
    ]
  };
};

const buildReminderDigest = async (client = pool, { asOf = new Date() } = {}) => {
  const reminders = await Promise.all([
    buildPendingWorkReminder(client, asOf),
    buildMeterReadingReminder(client, asOf),
    buildWeeklyProductionReadingReminder(client, asOf),
    buildBillPreparationReminder(client, asOf),
    buildContractorInvoiceReminder(client, asOf),
    buildPayrollPreparationReminder(client, asOf)
  ]);
  return reminders.map((reminder) => ({
    ...reminder,
    label: reminderTypeLabels[reminder.type] || reminder.type,
    hasWork: Number(reminder.count || 0) > 0,
    dueToday: Boolean(reminder.schedule?.due_today),
    reminder_key: sendKey(reminder.type)
  }));
};

const renderReminderText = (reminder) =>
  [
    reminder.label,
    "",
    ...reminder.lines,
    "",
    "Log in to AGUA Global to review and complete the related work."
  ].join("\n");

const sendOperationalReminders = async ({
  includeNoWork = false,
  dryRun = false,
  includeOutOfSchedule = false,
  onlyTypes = []
} = {}) => {
  const client = await pool.connect();
  const results = [];
  try {
    const reminders = await buildReminderDigest(client);
    for (const reminder of reminders) {
      if (onlyTypes.length && !onlyTypes.includes(reminder.type)) {
        results.push({ type: reminder.type, status: "skipped", reason: "Not included in this reminder run.", recipients: 0 });
        continue;
      }
      if (!includeNoWork && !reminder.hasWork) {
        results.push({ type: reminder.type, status: "skipped", reason: "No work requiring a reminder.", recipients: 0 });
        continue;
      }
      if (!includeOutOfSchedule && !reminder.dueToday) {
        results.push({
          type: reminder.type,
          status: "skipped",
          reason: reminder.schedule?.cadence || "Reminder is not scheduled for today.",
          recipients: 0
        });
        continue;
      }
      const recipients = await getRecipients(client, reminder.roles);
      if (!recipients.length) {
        results.push({ type: reminder.type, status: "skipped", reason: "No active recipients with email.", recipients: 0 });
        continue;
      }
      for (const recipient of recipients) {
        const existing = await client.query(
          `SELECT id, status, sent_at
           FROM operational_reminder_logs
           WHERE reminder_type = $1
             AND reminder_key = $2
             AND recipient_email = $3
           LIMIT 1`,
          [reminder.type, reminder.reminder_key, recipient.email]
        );
        if (existing.rows[0]) {
          results.push({ type: reminder.type, status: "skipped", reason: "Already sent for this key.", recipient: recipient.email });
          continue;
        }

        if (dryRun) {
          results.push({ type: reminder.type, status: "dry_run", recipient: recipient.email });
          continue;
        }

        let sendResult;
        let status = "sent";
        let errorMessage = null;
        try {
          sendResult = await sendEmail({
            to: recipient.email,
            subject: reminder.subject,
            text: renderReminderText(reminder)
          });
          status = sendResult.skipped ? "skipped" : "sent";
          errorMessage = sendResult.skipped ? "SMTP is not configured." : null;
        } catch (error) {
          status = "failed";
          errorMessage = error.message;
        }

        await client.query(
          `INSERT INTO operational_reminder_logs (
            reminder_type, reminder_key, recipient_email, recipient_user_id,
            subject, status, summary, error_message
          )
          VALUES ($1::varchar, $2::varchar, $3::varchar, $4, $5::varchar, $6::varchar, $7::jsonb, $8)
          ON CONFLICT (reminder_type, reminder_key, recipient_email) DO NOTHING`,
          [
            reminder.type,
            reminder.reminder_key,
            recipient.email,
            recipient.id,
            reminder.subject,
            status,
            JSON.stringify(reminder.summary || {}),
            errorMessage
          ]
        );
        results.push({ type: reminder.type, status, recipient: recipient.email, error_message: errorMessage });
      }
    }
  } finally {
    client.release();
  }

  return {
    generated_at: new Date().toISOString(),
    results
  };
};

module.exports = {
  buildReminderDigest,
  sendOperationalReminders
};
