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
       COALESCE(SUM(b.amount - b.paid_amount) FILTER (WHERE b.status <> 'paid'), 0) AS balance_due,
       COUNT(b.id) FILTER (WHERE b.status <> 'paid') AS unpaid_bills
     FROM customers c
     LEFT JOIN bills b ON b.customer_id = c.id
     GROUP BY c.id
     ORDER BY c.id`
  );

  console.log("Customer balances:");
  console.table(balances.rows);

  const paymentCount = await pool.query("SELECT COUNT(*) AS count FROM payments");
  console.log(`Payments in database: ${paymentCount.rows[0].count}`);

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
      `SELECT id, amount, paid_amount, status, amount - paid_amount AS balance
       FROM bills
       WHERE customer_id = $1 AND status <> 'paid'
       ORDER BY billing_month ASC, id ASC
       FOR UPDATE`,
      [selectedCustomerId]
    );

    console.log(`Dry run customer_id=${selectedCustomerId}, amount=${amount}`);
    console.table(bills.rows);

    const totalBalance = bills.rows.reduce(
      (sum, bill) => sum + (Number(bill.amount) - Number(bill.paid_amount)),
      0
    );
    console.log(`Total unpaid balance for dry run customer: ${totalBalance}`);

    if (amount > totalBalance) {
      console.log("Dry run would fail: payment exceeds customer balance.");
    } else {
      let remainingPayment = amount;
      let inserts = 0;
      for (const bill of bills.rows) {
        if (remainingPayment <= 0) break;
        const billBalance = Number(bill.amount) - Number(bill.paid_amount);
        const appliedAmount = Math.min(remainingPayment, billBalance);
        await client.query(
          `INSERT INTO payments (customer_id, bill_id, amount, payment_date, method, reference, notes)
           VALUES ($1, $2, $3, CURRENT_DATE, 'cash', 'DRY-RUN', 'Rollback dry run')`,
          [selectedCustomerId, bill.id, appliedAmount]
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
  await pool.end();
  process.exit(1);
});
