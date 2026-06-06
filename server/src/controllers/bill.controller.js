const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { assertBillEditable, normalizeCorrectionReason } = require("../services/billingPeriodGuard.service");
const {
  buildBillEmail,
  buildBillPdfAttachment,
  buildBillSms,
  getBusinessSettings,
  getCustomerEmailRecipient,
  getCustomerSmsRecipient,
  listDeliveryLogs,
  sendDocumentEmail,
  sendDocumentSms
} = require("../services/documentDelivery.service");

const listBills = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }

  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    clauses.push(`b.customer_id = $${params.length}`);
    clauses.push("b.bill_pay_status = 'payable'");
  }

  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone,
            bp.name AS billing_period_name,
            bp.status AS billing_period_status
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY b.billing_month DESC, b.created_at DESC`,
    params
  );
  res.json(rows);
});

const getBill = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone, c.location, z.name AS zone_name,
            bp.name AS billing_period_name,
            bp.status AS billing_period_status
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN zones z ON z.id = c.zone_id
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.id = $1
       AND ($2::text <> 'customer' OR (b.customer_id = $3 AND b.bill_pay_status = 'payable'))`,
    [req.params.id, req.user.role, req.user.customer_id || 0]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Bill not found.");
  }

  const penalties = await pool.query(
    `SELECT bpa.*, waived.name AS waived_by_name
     FROM bill_penalty_applications bpa
     LEFT JOIN users waived ON waived.id = bpa.waived_by
     WHERE bpa.bill_id = $1
     ORDER BY bpa.application_month DESC, bpa.id DESC`,
    [req.params.id]
  );

  const deliveryLogs = await listDeliveryLogs(pool, "bill", req.params.id);

  res.json({
    ...rows[0],
    penalty_applications: penalties.rows,
    delivery_logs: deliveryLogs
  });
});

const sendBillEmail = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const billResult = await client.query(
      `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone, c.location, z.name AS zone_name,
              bp.name AS billing_period_name,
              bp.status AS billing_period_status
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       LEFT JOIN zones z ON z.id = c.zone_id
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.id = $1`,
      [req.params.id]
    );
    const bill = billResult.rows[0];
    if (!bill) throw new ApiError(404, "Bill not found.");

    const penalties = await client.query(
      `SELECT bpa.*, waived.name AS waived_by_name
       FROM bill_penalty_applications bpa
       LEFT JOIN users waived ON waived.id = bpa.waived_by
       WHERE bpa.bill_id = $1
       ORDER BY bpa.application_month DESC, bpa.id DESC`,
      [bill.id]
    );

    const [business, recipient] = await Promise.all([
      getBusinessSettings(client),
      getCustomerEmailRecipient(client, bill.customer_id)
    ]);
    const billWithDetails = {
      ...bill,
      penalty_applications: penalties.rows
    };
    const email = buildBillEmail({ bill, business });
    const result = await sendDocumentEmail(client, req, {
      documentType: "bill",
      documentId: bill.id,
      customerId: bill.customer_id,
      recipient: recipient.email,
      subject: email.subject,
      text: email.text,
      attachments: [buildBillPdfAttachment({ bill: billWithDetails, business })]
    });

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: "bill.email_sent",
        entityType: "bill",
        entityId: bill.id,
        afterData: {
          recipient: recipient.email,
          status: result.status,
          delivery_log_id: result.log?.id || null,
          delivery_log_error: result.log_error || null
        },
        reason: `Bill email ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Bill email audit event could not be recorded.", error);
    }

    const logNote = result.log_error ? " Delivery history could not be updated." : "";
    const auditNote = auditError ? " Audit event could not be recorded." : "";
    res.json({
      ...result,
      audit_error: auditError,
      message: result.status === "sent" ? `Bill email sent.${logNote}${auditNote}` : `Bill email was not sent.${logNote}${auditNote}`
    });
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
});

const sendBillSms = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const billResult = await client.query(
      `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone, c.location, z.name AS zone_name,
              bp.name AS billing_period_name,
              bp.status AS billing_period_status
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       LEFT JOIN zones z ON z.id = c.zone_id
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.id = $1`,
      [req.params.id]
    );
    const bill = billResult.rows[0];
    if (!bill) throw new ApiError(404, "Bill not found.");

    const [business, recipient] = await Promise.all([
      getBusinessSettings(client),
      getCustomerSmsRecipient(client, bill.customer_id)
    ]);
    const messageText = buildBillSms({ bill, business });
    const result = await sendDocumentSms(client, req, {
      documentType: "bill",
      documentId: bill.id,
      customerId: bill.customer_id,
      recipient: recipient.phone,
      subject: `Bill ${bill.bill_number || bill.id}`,
      message: messageText
    });

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: "bill.sms_sent",
        entityType: "bill",
        entityId: bill.id,
        afterData: {
          recipient: recipient.phone,
          status: result.status,
          delivery_log_id: result.log?.id || null,
          delivery_log_error: result.log_error || null
        },
        reason: `Bill SMS ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Bill SMS audit event could not be recorded.", error);
    }

    const logNote = result.log_error ? " Delivery history could not be updated." : "";
    const auditNote = auditError ? " Audit event could not be recorded." : "";
    res.json({
      ...result,
      audit_error: auditError,
      message: result.status === "sent" ? `Bill SMS sent.${logNote}${auditNote}` : `Bill SMS was not sent.${logNote}${auditNote}`
    });
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
});

const markBillStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const correctionReason = normalizeCorrectionReason(req.body);
  if (!["unpaid", "partial", "paid"].includes(status)) {
    throw new ApiError(400, "Status must be unpaid, partial, or paid.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Bill not found.");
    }
    await assertBillEditable(client, before.id, req, correctionReason, "manually update a bill status");
    const { rows } = await client.query(
      `UPDATE bills
       SET status = $1,
           paid_amount = CASE WHEN $1 = 'paid' THEN COALESCE(NULLIF(total_amount, 0), amount) ELSE paid_amount END,
           balance_amount = CASE WHEN $1 = 'paid' THEN 0 ELSE GREATEST(COALESCE(NULLIF(total_amount, 0), amount) - paid_amount, 0) END,
           paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "bill.status_updated",
      entityType: "bill",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0],
      reason: correctionReason || null
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const promoteBillForPayment = asyncHandler(async (req, res) => {
  const reason = normalizeCorrectionReason(req.body);
  if (!reason) {
    throw new ApiError(400, "Promotion reason is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [req.params.id]);
    const target = targetResult.rows[0];
    if (!target) throw new ApiError(404, "Bill not found.");

    const competingResult = await client.query(
      `SELECT b.*,
              COALESCE((
                SELECT SUM(pa.amount)
                FROM payment_allocations pa
                WHERE pa.bill_id = b.id
              ), 0) AS allocated_amount
       FROM bills b
       WHERE b.customer_id = $1
         AND b.billing_period_id = $2
         AND b.id <> $3
         AND b.bill_pay_status = 'payable'
         AND (b.source_billing_request_id IS NOT NULL OR $4::integer IS NOT NULL OR b.billing_source <> $5)
       FOR UPDATE`,
      [
        target.customer_id,
        target.billing_period_id,
        target.id,
        target.source_billing_request_id || null,
        target.billing_source
      ]
    );

    const paidCompetitor = competingResult.rows.find(
      (bill) => Number(bill.paid_amount || 0) > 0 || Number(bill.allocated_amount || 0) > 0
    );
    if (paidCompetitor) {
      throw new ApiError(
        400,
        `Bill ${paidCompetitor.bill_number || paidCompetitor.id} has payments allocated. Void those payments first, then reapply after promotion.`
      );
    }

    const beforeData = {
      target,
      competing: competingResult.rows
    };

    const demoted = [];
    for (const bill of competingResult.rows) {
      const result = await client.query(
        `UPDATE bills
         SET bill_pay_status = 'superseded',
             payability_reason = $1,
             promoted_by = $2,
             promoted_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [`Superseded by bill ${target.bill_number || target.id}: ${reason}`, req.user.id, bill.id]
      );
      demoted.push(result.rows[0]);
    }

    const promotedResult = await client.query(
      `UPDATE bills
       SET bill_pay_status = 'payable',
           payability_reason = $1,
           promoted_by = $2,
           promoted_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, req.user.id, target.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "bill.promoted_for_payment",
      entityType: "bill",
      entityId: target.id,
      beforeData,
      afterData: {
        promoted: promotedResult.rows[0],
        superseded: demoted
      },
      reason
    });

    await client.query("COMMIT");
    res.json({ promoted: promotedResult.rows[0], superseded: demoted });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listBills,
  getBill,
  markBillStatus,
  promoteBillForPayment,
  sendBillEmail,
  sendBillSms
};
