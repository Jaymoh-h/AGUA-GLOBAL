const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listPayments = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS customer_name, c.acc_number, b.status AS bill_status
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN bills b ON b.id = p.bill_id
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const findCustomer = async (client, customerIdentifier, customerId) => {
  if (customerId) {
    const { rows } = await client.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    return rows[0];
  }

  const { rows } = await client.query(
    `SELECT * FROM customers
     WHERE acc_number = $1 OR LOWER(name) = LOWER($1)
     ORDER BY CASE WHEN acc_number = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [customerIdentifier]
  );
  return rows[0];
};

const createPayment = asyncHandler(async (req, res) => {
  const { customerIdentifier, customer_id, bill_id, amount, payment_date, method, reference, notes } = req.body;
  const paymentAmount = Number(amount);

  if ((!customerIdentifier && !customer_id) || amount === undefined) {
    throw new ApiError(400, "Customer and amount are required.");
  }

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customer = await findCustomer(client, customerIdentifier, customer_id);
    if (!customer) {
      throw new ApiError(404, "Customer not found by name or account number.");
    }

    let bills = [];
    if (bill_id) {
      const billResult = await client.query(
        "SELECT * FROM bills WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [bill_id, customer.id]
      );
      bills = billResult.rows;
    } else {
      const billResult = await client.query(
        `SELECT * FROM bills
         WHERE customer_id = $1 AND status <> 'paid'
         ORDER BY billing_month ASC, id ASC
         FOR UPDATE`,
        [customer.id]
      );
      bills = billResult.rows;
    }

    if (!bills.length) {
      throw new ApiError(404, "No unpaid bill found for this customer.");
    }

    const totalBalance = bills.reduce(
      (sum, bill) => sum + (Number(bill.amount) - Number(bill.paid_amount)),
      0
    );
    if (paymentAmount > totalBalance) {
      throw new ApiError(400, `Payment exceeds ${customer.acc_number}'s unpaid balance of ${totalBalance}.`);
    }

    let remainingPayment = paymentAmount;
    const payments = [];
    const updatedBills = [];

    for (const bill of bills) {
      if (remainingPayment <= 0) break;

      const billBalance = Number(bill.amount) - Number(bill.paid_amount);
      const appliedAmount = Math.min(remainingPayment, billBalance);
      const nextPaidAmount = Number(bill.paid_amount) + appliedAmount;
      const nextStatus = nextPaidAmount >= Number(bill.amount) ? "paid" : "partial";

      const paymentResult = await client.query(
        `INSERT INTO payments (customer_id, bill_id, amount, payment_date, method, reference, notes, recorded_by)
         VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), COALESCE($5, 'cash'), $6, $7, $8)
         RETURNING *`,
        [
          customer.id,
          bill.id,
          appliedAmount,
          payment_date || null,
          method || null,
          reference || null,
          notes || null,
          req.user.id
        ]
      );

      const billResult = await client.query(
        `UPDATE bills
         SET paid_amount = paid_amount + $1,
             status = $2::varchar,
             paid_at = CASE WHEN $2::text = 'paid' THEN NOW() ELSE paid_at END
         WHERE id = $3
         RETURNING *`,
        [appliedAmount, nextStatus, bill.id]
      );

      payments.push(paymentResult.rows[0]);
      updatedBills.push(billResult.rows[0]);
      remainingPayment -= appliedAmount;
    }

    await client.query("COMMIT");
    res.status(201).json({
      payment: payments[0],
      payments,
      bill: updatedBills[0],
      bills: updatedBills
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updatePayment = asyncHandler(async (req, res) => {
  const { amount, payment_date, method, reference, notes } = req.body;
  const paymentAmount = amount === undefined ? undefined : Number(amount);

  if (paymentAmount !== undefined && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query("SELECT * FROM payments WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new ApiError(404, "Payment not found.");
    }

    const billResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [payment.bill_id]);
    const bill = billResult.rows[0];
    if (!bill) {
      throw new ApiError(404, "Linked bill not found.");
    }

    const nextAmount = paymentAmount === undefined ? Number(payment.amount) : paymentAmount;
    const currentBillPaidWithoutPayment = Number(bill.paid_amount) - Number(payment.amount);
    if (currentBillPaidWithoutPayment + nextAmount > Number(bill.amount)) {
      const available = Number(bill.amount) - currentBillPaidWithoutPayment;
      throw new ApiError(400, `Payment exceeds the selected bill balance of ${available}.`);
    }

    const updatedPayment = await client.query(
      `UPDATE payments
       SET amount = $1,
           payment_date = COALESCE($2::date, payment_date),
           method = COALESCE($3::varchar, method),
           reference = $4::varchar,
           notes = $5::text
       WHERE id = $6
       RETURNING *`,
      [
        nextAmount,
        payment_date || null,
        method || null,
        reference ?? payment.reference,
        notes ?? payment.notes,
        req.params.id
      ]
    );

    const nextPaidAmount = currentBillPaidWithoutPayment + nextAmount;
    const nextStatus =
      nextPaidAmount <= 0 ? "unpaid" : nextPaidAmount >= Number(bill.amount) ? "paid" : "partial";
    const updatedBill = await client.query(
      `UPDATE bills
       SET paid_amount = $1,
           status = $2::varchar,
           paid_at = CASE WHEN $2::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
       WHERE id = $3
       RETURNING *`,
      [nextPaidAmount, nextStatus, bill.id]
    );

    await client.query("COMMIT");
    res.json({ payment: updatedPayment.rows[0], bill: updatedBill.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listPayments,
  createPayment,
  updatePayment
};
