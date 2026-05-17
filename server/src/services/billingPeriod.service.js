const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const toDateOnly = (value) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const getMonthlyPeriodDates = (dateValue) => {
  const date = new Date(`${toDateOnly(dateValue)}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 0));
  const dueDate = new Date(Date.UTC(year, month + 2, 0));

  return {
    name: `${monthNames[month]} ${year}`,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    closingDate: periodEnd.toISOString().slice(0, 10),
    billDate: periodEnd.toISOString().slice(0, 10),
    dueDate: dueDate.toISOString().slice(0, 10)
  };
};

const getBillingSettings = async (client) => {
  const { rows } = await client.query("SELECT * FROM billing_settings WHERE id = 1");
  if (rows[0]) return rows[0];

  const inserted = await client.query(
    `INSERT INTO billing_settings (id)
     VALUES (1)
     ON CONFLICT (id) DO UPDATE SET updated_at = billing_settings.updated_at
     RETURNING *`
  );
  return inserted.rows[0];
};

const getOrCreateBillingPeriod = async (client, dateValue, actorUserId = null) => {
  await getBillingSettings(client);
  const dates = getMonthlyPeriodDates(dateValue);

  const { rows } = await client.query(
    `INSERT INTO billing_periods (
      name, period_start, period_end, closing_date, bill_date, due_date, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
    ON CONFLICT (period_start) DO UPDATE
    SET name = EXCLUDED.name,
        period_end = EXCLUDED.period_end,
        closing_date = EXCLUDED.closing_date,
        bill_date = EXCLUDED.bill_date,
        due_date = EXCLUDED.due_date,
        updated_at = NOW()
    RETURNING *`,
    [
      dates.name,
      dates.periodStart,
      dates.periodEnd,
      dates.closingDate,
      dates.billDate,
      dates.dueDate,
      actorUserId
    ]
  );

  return rows[0];
};

const createBillNumber = (billingPeriod, customer, readingId) => {
  const periodCode = toDateOnly(billingPeriod.period_start).replace(/-/g, "").slice(0, 6);
  return `BILL-${periodCode}-${customer.acc_number}-${readingId}`;
};

module.exports = {
  createBillNumber,
  getBillingSettings,
  getMonthlyPeriodDates,
  getOrCreateBillingPeriod
};
