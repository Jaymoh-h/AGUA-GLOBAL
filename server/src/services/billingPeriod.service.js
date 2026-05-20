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

const padSequence = (value, padding = 6) => String(value).padStart(Number(padding || 6), "0");

const nextDocumentNumber = async (client, type) => {
  await getBillingSettings(client);
  const settingsResult = await client.query("SELECT * FROM billing_settings WHERE id = 1 FOR UPDATE");
  const settings = settingsResult.rows[0];
  const prefixColumn = type === "receipt" ? "receipt_number_prefix" : "bill_number_prefix";
  const nextColumn = type === "receipt" ? "receipt_number_next" : "bill_number_next";
  const prefix = settings[prefixColumn] || (type === "receipt" ? "RCPT" : "BILL");
  const nextValue = Number(settings[nextColumn] || 1);
  const number = `${prefix}-${padSequence(nextValue, settings.number_padding)}`;

  await client.query(
    `UPDATE billing_settings
     SET ${nextColumn} = ${nextColumn} + 1,
         updated_at = NOW()
     WHERE id = 1`
  );

  return number;
};

const createBillNumber = async (client) => {
  return nextDocumentNumber(client, "bill");
};

const createReceiptNumber = async (client) => {
  return nextDocumentNumber(client, "receipt");
};

module.exports = {
  createBillNumber,
  createReceiptNumber,
  getBillingSettings,
  getMonthlyPeriodDates,
  getOrCreateBillingPeriod
};
