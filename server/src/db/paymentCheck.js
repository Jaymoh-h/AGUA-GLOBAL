require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  const customerId = process.argv[2] ? Number(process.argv[2]) : null;
  const amount = process.argv[3] ? Number(process.argv[3]) : 1;

  const balances = await pool.query(
    `SELECT
       c.id AS customer_id,
       c.acc_number,
       c.name,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable'), 0) AS balance_due,
       COUNT(b.id) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable') AS unpaid_bills
     FROM customers c
     LEFT JOIN bills b ON b.customer_id = c.id
     GROUP BY c.id
     ORDER BY c.id`
  );

  console.log("Customer balances:");
  console.table(balances.rows);

  const paymentCount = await pool.query("SELECT COUNT(*) AS count FROM payments");
  const allocationCount = await pool.query("SELECT COUNT(*) AS count FROM payment_allocations");
  console.log(`Payment receipts in database: ${paymentCount.rows[0].count}`);
  console.log(`Payment allocations in database: ${allocationCount.rows[0].count}`);

  const selectedCustomerId =
    customerId || balances.rows.find((row) => Number(row.balance_due) > 0)?.customer_id;

  if (!selectedCustomerId) {
    console.log("No customer with unpaid balance found for dry run.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bills = await client.query(
      `SELECT id, COALESCE(NULLIF(total_amount, 0), amount) AS amount, paid_amount, status,
              COALESCE(NULLIF(balance_amount, 0), amount - paid_amount) AS balance
       FROM bills
       WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'
       ORDER BY billing_month ASC, id ASC
       FOR UPDATE`,
      [selectedCustomerId]
    );

    console.log(`Dry run customer_id=${selectedCustomerId}, amount=${amount}`);
    console.table(bills.rows);

    const totalBalance = bills.rows.reduce((sum, bill) => sum + Number(bill.balance), 0);
    console.log(`Total unpaid balance for dry run customer: ${totalBalance}`);

    if (amount > totalBalance) {
      console.log("Dry run would fail: payment exceeds customer balance.");
    } else {
      let remainingPayment = amount;
      let inserts = 0;
      for (const bill of bills.rows) {
        if (remainingPayment <= 0) break;
        const billBalance = Number(bill.balance);
        const appliedAmount = Math.min(remainingPayment, billBalance);
        const paymentResult = await client.query(
          `INSERT INTO payments (
             customer_id, bill_id, amount, payment_date, method, reference,
             receipt_number, payment_channel, external_reference, total_allocated_amount, notes
           )
           VALUES ($1, $2::integer, $3, CURRENT_DATE, 'cash', 'DRY-RUN', 'DRY-RUN-' || $2::integer::text, 'cash', 'DRY-RUN', $3, 'Rollback dry run')
           RETURNING id`,
          [selectedCustomerId, bill.id, appliedAmount]
        );
        await client.query(
          `INSERT INTO payment_allocations (payment_id, bill_id, amount)
           VALUES ($1, $2, $3)`,
          [paymentResult.rows[0].id, bill.id, appliedAmount]
        );
        const nextPaidAmount = Number(bill.paid_amount) + appliedAmount;
        const nextStatus = nextPaidAmount >= Number(bill.amount) ? "paid" : "partial";
        await client.query(
          `UPDATE bills
           SET paid_amount = paid_amount + $1,
               status = $2::varchar,
               paid_at = CASE WHEN $2::text = 'paid' THEN NOW() ELSE paid_at END
           WHERE id = $3`,
          [appliedAmount, nextStatus, bill.id]
        );
        inserts += 1;
        remainingPayment -= appliedAmount;
      }
      console.log(`Dry run inserted ${inserts} payment row(s), then rolled back.`);
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
};

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
