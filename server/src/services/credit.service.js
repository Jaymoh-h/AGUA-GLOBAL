const getBillTotal = (bill) => Number(bill.total_amount || bill.amount || 0);

const getBillStatus = (paidAmount, billTotal) => {
  if (paidAmount <= 0) return "unpaid";
  return paidAmount >= billTotal ? "paid" : "partial";
};

const applyCustomerCreditToBill = async (client, { customerId, billId }) => {
  const billResult = await client.query("SELECT * FROM bills WHERE id = $1 AND customer_id = $2 FOR UPDATE", [
    billId,
    customerId
  ]);
  const bill = billResult.rows[0];
  if (!bill) return { appliedAmount: 0, allocations: [], bill: null };

  const billTotal = getBillTotal(bill);
  let billBalance = Math.max(billTotal - Number(bill.paid_amount || 0), 0);
  if (billBalance <= 0) return { appliedAmount: 0, allocations: [], bill };

  const creditResult = await client.query(
    `SELECT *
     FROM payments
     WHERE customer_id = $1
       AND status = 'posted'
       AND unallocated_amount > 0
     ORDER BY payment_date ASC, id ASC
     FOR UPDATE`,
    [customerId]
  );

  const allocations = [];
  let appliedAmount = 0;
  let paidAmount = Number(bill.paid_amount || 0);

  for (const payment of creditResult.rows) {
    if (billBalance <= 0) break;

    const applied = Math.min(Number(payment.unallocated_amount || 0), billBalance);
    if (applied <= 0) continue;

    const allocationResult = await client.query(
      `INSERT INTO payment_allocations (payment_id, bill_id, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (payment_id, bill_id) DO UPDATE
       SET amount = payment_allocations.amount + EXCLUDED.amount
       RETURNING *`,
      [payment.id, billId, applied]
    );

    await client.query(
      `UPDATE payments
       SET total_allocated_amount = total_allocated_amount + $1,
           unallocated_amount = GREATEST(unallocated_amount - $1, 0),
           updated_at = NOW()
       WHERE id = $2`,
      [applied, payment.id]
    );

    allocations.push(allocationResult.rows[0]);
    appliedAmount += applied;
    paidAmount += applied;
    billBalance -= applied;
  }

  const nextStatus = getBillStatus(paidAmount, billTotal);
  const updatedBill = await client.query(
    `UPDATE bills
     SET paid_amount = $1,
         balance_amount = $2,
         status = $3::varchar,
         paid_at = CASE WHEN $3::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
     WHERE id = $4
     RETURNING *`,
    [paidAmount, Math.max(billTotal - paidAmount, 0), nextStatus, billId]
  );

  return {
    appliedAmount,
    allocations,
    bill: updatedBill.rows[0]
  };
};

module.exports = {
  applyCustomerCreditToBill
};
