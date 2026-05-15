const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listReadings = asyncHandler(async (req, res) => {
  const params = [];
  const scope =
    req.user.role === "customer" ? `WHERE mr.customer_id = $${params.push(req.user.customer_id || 0)}` : "";
  const { rows } = await pool.query(
    `SELECT mr.*, c.name AS customer_name, c.acc_number, u.name AS created_by_name
     FROM meter_readings mr
     JOIN customers c ON c.id = mr.customer_id
     LEFT JOIN users u ON u.id = mr.created_by
     ${scope}
     ORDER BY mr.reading_date DESC, mr.created_at DESC
     LIMIT 200`,
    params
  );
  res.json(rows);
});

const createReading = asyncHandler(async (req, res) => {
  const { customer_id, reading_value, reading_date } = req.body;

  if (!customer_id || reading_value === undefined || !reading_date) {
    throw new ApiError(400, "Customer, reading value, and reading date are required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customer_id]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    const previousResult = await client.query(
      `SELECT * FROM meter_readings
       WHERE customer_id = $1 AND reading_date < $2
       ORDER BY reading_date DESC, id DESC
       LIMIT 1`,
      [customer_id, reading_date]
    );
    const previous = previousResult.rows[0];

    if (previous && Number(reading_value) < Number(previous.reading_value)) {
      throw new ApiError(400, "Current reading cannot be lower than previous reading.");
    }

    const readingResult = await client.query(
      `INSERT INTO meter_readings (customer_id, reading_value, reading_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [customer_id, reading_value, reading_date, req.user.id]
    );
    const reading = readingResult.rows[0];

    let bill = null;
    if (previous) {
      const unitsUsed = Number(reading_value) - Number(previous.reading_value);
      const amount = unitsUsed * Number(customer.rate);
      const billResult = await client.query(
        `INSERT INTO bills (
          customer_id, previous_reading_id, current_reading_id, billing_month,
          previous_reading, current_reading, units_used, rate, amount, due_date
        )
        VALUES ($1, $2, $3, date_trunc('month', $4::date)::date, $5, $6, $7, $8, $9, $4::date + INTERVAL '14 days')
        RETURNING *`,
        [
          customer_id,
          previous.id,
          reading.id,
          reading_date,
          previous.reading_value,
          reading_value,
          unitsUsed,
          customer.rate,
          amount
        ]
      );
      bill = billResult.rows[0];
    }

    await client.query("COMMIT");
    res.status(201).json({ reading, bill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const recalculateBillForReading = async (client, readingId) => {
  const readingResult = await client.query(
    `SELECT mr.*, c.rate
     FROM meter_readings mr
     JOIN customers c ON c.id = mr.customer_id
     WHERE mr.id = $1`,
    [readingId]
  );
  const reading = readingResult.rows[0];
  if (!reading) return null;

  const previousResult = await client.query(
    `SELECT * FROM meter_readings
     WHERE customer_id = $1 AND reading_date < $2 AND id <> $3
     ORDER BY reading_date DESC, id DESC
     LIMIT 1`,
    [reading.customer_id, reading.reading_date, reading.id]
  );
  const previous = previousResult.rows[0];

  const existingBillResult = await client.query(
    "SELECT * FROM bills WHERE current_reading_id = $1 FOR UPDATE",
    [reading.id]
  );
  const existingBill = existingBillResult.rows[0];

  if (!previous) {
    if (existingBill && Number(existingBill.paid_amount) > 0) {
      throw new ApiError(400, "Cannot make a paid/partial billed reading the baseline reading.");
    }

    if (existingBill) {
      await client.query("DELETE FROM bills WHERE id = $1", [existingBill.id]);
    }
    return null;
  }

  if (Number(reading.reading_value) < Number(previous.reading_value)) {
    throw new ApiError(400, "Reading cannot be lower than the previous reading.");
  }

  const unitsUsed = Number(reading.reading_value) - Number(previous.reading_value);
  const amount = unitsUsed * Number(reading.rate);

  if (existingBill) {
    const nextPaidAmount = Math.min(Number(existingBill.paid_amount), amount);
    const nextStatus = nextPaidAmount <= 0 ? "unpaid" : nextPaidAmount >= amount ? "paid" : "partial";
    const billResult = await client.query(
      `UPDATE bills
       SET previous_reading_id = $1,
           billing_month = date_trunc('month', $2::date)::date,
           previous_reading = $3,
           current_reading = $4,
           units_used = $5,
           rate = $6,
           amount = $7,
           paid_amount = $8,
           status = $9,
           due_date = $2::date + INTERVAL '14 days',
           paid_at = CASE WHEN $9 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
       WHERE id = $10
       RETURNING *`,
      [
        previous.id,
        reading.reading_date,
        previous.reading_value,
        reading.reading_value,
        unitsUsed,
        reading.rate,
        amount,
        nextPaidAmount,
        nextStatus,
        existingBill.id
      ]
    );
    return billResult.rows[0];
  }

  const billResult = await client.query(
    `INSERT INTO bills (
      customer_id, previous_reading_id, current_reading_id, billing_month,
      previous_reading, current_reading, units_used, rate, amount, due_date
    )
    VALUES ($1, $2, $3, date_trunc('month', $4::date)::date, $5, $6, $7, $8, $9, $4::date + INTERVAL '14 days')
    RETURNING *`,
    [
      reading.customer_id,
      previous.id,
      reading.id,
      reading.reading_date,
      previous.reading_value,
      reading.reading_value,
      unitsUsed,
      reading.rate,
      amount
    ]
  );
  return billResult.rows[0];
};

const updateReading = asyncHandler(async (req, res) => {
  const { customer_id, reading_value, reading_date } = req.body;

  if (!customer_id || reading_value === undefined || !reading_date) {
    throw new ApiError(400, "Customer, reading value, and reading date are required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingResult = await client.query("SELECT * FROM meter_readings WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new ApiError(404, "Reading not found.");
    }

    const oldNextResult = await client.query(
      `SELECT id FROM meter_readings
       WHERE customer_id = $1 AND reading_date > $2
       ORDER BY reading_date ASC, id ASC
       LIMIT 1`,
      [existing.customer_id, existing.reading_date]
    );

    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customer_id]);
    if (!customerResult.rows[0]) {
      throw new ApiError(404, "Customer not found.");
    }

    const updatedResult = await client.query(
      `UPDATE meter_readings
       SET customer_id = $1,
           reading_value = $2,
           reading_date = $3
       WHERE id = $4
       RETURNING *`,
      [customer_id, reading_value, reading_date, req.params.id]
    );

    const bill = await recalculateBillForReading(client, updatedResult.rows[0].id);

    const nextResult = await client.query(
      `SELECT id FROM meter_readings
       WHERE customer_id = $1 AND reading_date > $2
       ORDER BY reading_date ASC, id ASC
       LIMIT 1`,
      [customer_id, reading_date]
    );

    let nextBill = null;
    if (nextResult.rows[0]) {
      nextBill = await recalculateBillForReading(client, nextResult.rows[0].id);
    }

    let oldNextBill = null;
    if (
      oldNextResult.rows[0] &&
      oldNextResult.rows[0].id !== updatedResult.rows[0].id &&
      oldNextResult.rows[0].id !== nextResult.rows[0]?.id
    ) {
      oldNextBill = await recalculateBillForReading(client, oldNextResult.rows[0].id);
    }

    await client.query("COMMIT");
    res.json({ reading: updatedResult.rows[0], bill, nextBill, oldNextBill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listReadings,
  createReading,
  updateReading
};
