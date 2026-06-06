const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { assertNotFutureDate } = require("../services/dateGuard.service");
const { createExpenseRecord } = require("./expense.controller");

const invoiceStatuses = ["draft", "submitted", "approved", "rejected", "posted_to_expense", "paid"];

const nullableText = (value) => {
  if (value === undefined) return undefined;
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const requireDate = (value, label) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ApiError(400, `${label} must use YYYY-MM-DD.`);
  return text;
};

const positiveNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ApiError(400, `${label} must be greater than zero.`);
  return number;
};

const nonNegativeNumber = (value, label) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) throw new ApiError(400, `${label} cannot be negative.`);
  return number;
};

const listContractors = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*,
            COALESCE(invoice_summary.open_count, 0) AS open_invoice_count,
            COALESCE(invoice_summary.open_amount, 0) AS open_invoice_amount
     FROM contractors c
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS open_count,
              COALESCE(SUM(total_amount), 0) AS open_amount
       FROM contractor_invoices ci
       WHERE ci.contractor_id = c.id
         AND ci.status IN ('draft', 'submitted', 'approved')
     ) invoice_summary ON TRUE
     ORDER BY c.status ASC, c.name ASC`
  );
  res.json(rows);
});

const createContractor = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) throw new ApiError(400, "Contractor name is required.");
  const paymentTermsDays = Number(req.body.payment_terms_days ?? 30);
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) {
    throw new ApiError(400, "Payment terms must be a whole number of days.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO contractors (
        name, phone, email, tax_pin, payment_terms_days, status, notes, created_by
      )
      VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5, $6::varchar, $7, $8)
      RETURNING *`,
      [
        name,
        nullableText(req.body.phone),
        nullableText(req.body.email),
        nullableText(req.body.tax_pin),
        paymentTermsDays,
        req.body.status === "inactive" ? "inactive" : "active",
        nullableText(req.body.notes),
        req.user.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "contractor.created",
      entityType: "contractor",
      entityId: rows[0].id,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "A contractor with this name already exists.");
    throw error;
  } finally {
    client.release();
  }
});

const updateContractor = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) throw new ApiError(400, "Contractor name is required.");
  const paymentTermsDays = Number(req.body.payment_terms_days ?? 30);
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) {
    throw new ApiError(400, "Payment terms must be a whole number of days.");
  }
  const status = req.body.status === "inactive" ? "inactive" : "active";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM contractors WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Contractor not found.");

    const { rows } = await client.query(
      `UPDATE contractors
       SET name = $1::varchar,
           phone = $2::varchar,
           email = $3::varchar,
           tax_pin = $4::varchar,
           payment_terms_days = $5,
           status = $6::varchar,
           notes = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name,
        nullableText(req.body.phone),
        nullableText(req.body.email),
        nullableText(req.body.tax_pin),
        paymentTermsDays,
        status,
        nullableText(req.body.notes),
        req.params.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "contractor.updated",
      entityType: "contractor",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "A contractor with this name already exists.");
    throw error;
  } finally {
    client.release();
  }
});

const listInvoices = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ci.*,
            c.name AS contractor_name,
            c.tax_pin AS contractor_tax_pin,
            creator.name AS created_by_name,
            reviewer.name AS reviewed_by_name,
            poster.name AS posted_by_name,
            e.expense_date,
            e.reference AS expense_reference,
            COALESCE(document_summary.document_count, 0) AS document_count
     FROM contractor_invoices ci
     JOIN contractors c ON c.id = ci.contractor_id
     LEFT JOIN users creator ON creator.id = ci.created_by
     LEFT JOIN users reviewer ON reviewer.id = ci.reviewed_by
     LEFT JOIN users poster ON poster.id = ci.posted_by
     LEFT JOIN expenses e ON e.id = ci.expense_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS document_count
       FROM supporting_documents sd
       WHERE sd.entity_type = 'contractor_invoice'
         AND sd.entity_id = ci.id
         AND sd.deleted_at IS NULL
     ) document_summary ON TRUE
     ORDER BY ci.invoice_date DESC, ci.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const createInvoice = asyncHandler(async (req, res) => {
  const contractorId = Number(req.body.contractor_id);
  if (!Number.isInteger(contractorId) || contractorId <= 0) throw new ApiError(400, "Contractor is required.");
  const invoiceNumber = String(req.body.invoice_number || "").trim();
  const description = String(req.body.description || "").trim();
  const category = String(req.body.category || "Contractor services").trim();
  const invoiceDate = requireDate(req.body.invoice_date, "Invoice date");
  const dueDate = requireDate(req.body.due_date, "Due date");
  const subtotalAmount = nonNegativeNumber(req.body.subtotal_amount, "Subtotal");
  const vatAmount = nonNegativeNumber(req.body.vat_amount, "VAT");
  const totalAmount = req.body.total_amount === undefined || req.body.total_amount === ""
    ? subtotalAmount + vatAmount
    : positiveNumber(req.body.total_amount, "Total amount");
  const status = req.body.status === "submitted" ? "submitted" : "draft";

  if (!invoiceNumber) throw new ApiError(400, "Invoice number is required.");
  if (!description) throw new ApiError(400, "Description is required.");
  if (!category) throw new ApiError(400, "Category is required.");
  if (dueDate < invoiceDate) throw new ApiError(400, "Due date cannot be before invoice date.");
  if (totalAmount <= 0) throw new ApiError(400, "Total amount must be greater than zero.");
  assertNotFutureDate(invoiceDate, req, "Invoice date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const contractor = await client.query("SELECT id FROM contractors WHERE id = $1 AND status = 'active'", [contractorId]);
    if (!contractor.rows[0]) throw new ApiError(400, "Selected contractor is not active.");

    const { rows } = await client.query(
      `INSERT INTO contractor_invoices (
        contractor_id, invoice_number, invoice_date, due_date, description, category,
        subtotal_amount, vat_amount, total_amount, status, notes, created_by
      )
      VALUES ($1, $2::varchar, $3, $4, $5, $6::varchar, $7, $8, $9, $10::varchar, $11, $12)
      RETURNING *`,
      [
        contractorId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        description,
        category,
        subtotalAmount,
        vatAmount,
        totalAmount,
        status,
        nullableText(req.body.notes),
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "contractor_invoice.created",
      entityType: "contractor_invoice",
      entityId: rows[0].id,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "This contractor invoice number already exists.");
    throw error;
  } finally {
    client.release();
  }
});

const updateInvoice = asyncHandler(async (req, res) => {
  const contractorId = Number(req.body.contractor_id);
  if (!Number.isInteger(contractorId) || contractorId <= 0) throw new ApiError(400, "Contractor is required.");
  const invoiceNumber = String(req.body.invoice_number || "").trim();
  const description = String(req.body.description || "").trim();
  const category = String(req.body.category || "Contractor services").trim();
  const invoiceDate = requireDate(req.body.invoice_date, "Invoice date");
  const dueDate = requireDate(req.body.due_date, "Due date");
  const subtotalAmount = nonNegativeNumber(req.body.subtotal_amount, "Subtotal");
  const vatAmount = nonNegativeNumber(req.body.vat_amount, "VAT");
  const totalAmount = req.body.total_amount === undefined || req.body.total_amount === ""
    ? subtotalAmount + vatAmount
    : positiveNumber(req.body.total_amount, "Total amount");

  if (!invoiceNumber) throw new ApiError(400, "Invoice number is required.");
  if (!description) throw new ApiError(400, "Description is required.");
  if (!category) throw new ApiError(400, "Category is required.");
  if (dueDate < invoiceDate) throw new ApiError(400, "Due date cannot be before invoice date.");
  if (totalAmount <= 0) throw new ApiError(400, "Total amount must be greater than zero.");
  assertNotFutureDate(invoiceDate, req, "Invoice date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM contractor_invoices WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Contractor invoice not found.");
    if (["posted_to_expense", "paid"].includes(before.status)) {
      throw new ApiError(400, "Posted or paid contractor invoices cannot be edited.");
    }

    if (Number(before.contractor_id) === contractorId) {
      const contractor = await client.query("SELECT id FROM contractors WHERE id = $1", [contractorId]);
      if (!contractor.rows[0]) throw new ApiError(400, "Selected contractor was not found.");
    } else {
      const contractor = await client.query("SELECT id FROM contractors WHERE id = $1 AND status = 'active'", [contractorId]);
      if (!contractor.rows[0]) throw new ApiError(400, "Selected contractor is not active.");
    }

    const nextStatus = before.status === "approved" ? "submitted" : before.status;
    const { rows } = await client.query(
      `UPDATE contractor_invoices
       SET contractor_id = $1,
           invoice_number = $2::varchar,
           invoice_date = $3,
           due_date = $4,
           description = $5,
           category = $6::varchar,
           subtotal_amount = $7,
           vat_amount = $8,
           total_amount = $9,
           notes = $10,
           status = $11::varchar,
           reviewed_by = CASE WHEN $11::varchar = 'submitted' AND status = 'approved' THEN NULL ELSE reviewed_by END,
           reviewed_at = CASE WHEN $11::varchar = 'submitted' AND status = 'approved' THEN NULL ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        contractorId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        description,
        category,
        subtotalAmount,
        vatAmount,
        totalAmount,
        nullableText(req.body.notes),
        nextStatus,
        req.params.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "contractor_invoice.updated",
      entityType: "contractor_invoice",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "This contractor invoice number already exists.");
    throw error;
  } finally {
    client.release();
  }
});

const updateInvoiceStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || "").trim();
  if (!["submitted", "approved", "rejected"].includes(status)) {
    throw new ApiError(400, "Status must be submitted, approved, or rejected.");
  }
  const reason = String(req.body.reason || "").trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM contractor_invoices WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Contractor invoice not found.");
    if (["posted_to_expense", "paid"].includes(before.status)) {
      throw new ApiError(400, "Posted or paid contractor invoices cannot be re-reviewed.");
    }
    if (status === "approved" && !["draft", "submitted", "rejected"].includes(before.status)) {
      throw new ApiError(400, "Only draft, submitted, or rejected invoices can be approved.");
    }

    const { rows } = await client.query(
      `UPDATE contractor_invoices
       SET status = $1::varchar,
           reviewed_by = CASE WHEN $1::varchar IN ('approved', 'rejected') THEN $2 ELSE reviewed_by END,
           reviewed_at = CASE WHEN $1::varchar IN ('approved', 'rejected') THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, req.params.id]
    );

    await recordAuditEvent(client, {
      req,
      action: `contractor_invoice.${status}`,
      entityType: "contractor_invoice",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0],
      reason
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

const postInvoiceToExpense = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceResult = await client.query(
      `SELECT ci.*, c.name AS contractor_name
       FROM contractor_invoices ci
       JOIN contractors c ON c.id = ci.contractor_id
       WHERE ci.id = $1
       FOR UPDATE OF ci`,
      [req.params.id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new ApiError(404, "Contractor invoice not found.");
    if (invoice.status !== "approved") throw new ApiError(400, "Only approved contractor invoices can be posted to expenses.");
    if (invoice.expense_id) throw new ApiError(400, "This contractor invoice has already been posted to expenses.");

    const expense = await createExpenseRecord(
      client,
      req,
      {
        expense_date: req.body.expense_date || invoice.invoice_date,
        category: invoice.category,
        vendor: invoice.contractor_name,
        description: invoice.description,
        amount: invoice.total_amount,
        payment_channel: req.body.payment_channel || "manual_adjustment",
        reference: invoice.invoice_number,
        receipt_number: req.body.receipt_number || null,
        notes: req.body.notes || `Contractor invoice ${invoice.invoice_number}`,
        contractor_invoice_id: invoice.id
      },
      { auditReason: `Contractor invoice ${invoice.invoice_number}` }
    );

    const updatedResult = await client.query(
      `UPDATE contractor_invoices
       SET status = 'posted_to_expense',
           expense_id = $1,
           posted_by = $2,
           posted_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [expense.id, req.user.id, invoice.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "contractor_invoice.posted_to_expense",
      entityType: "contractor_invoice",
      entityId: invoice.id,
      beforeData: invoice,
      afterData: updatedResult.rows[0],
      reason: `Posted to expense #${expense.id}`
    });

    await client.query("COMMIT");
    res.status(201).json({ invoice: updatedResult.rows[0], expense });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  createContractor,
  createInvoice,
  listContractors,
  listInvoices,
  postInvoiceToExpense,
  updateContractor,
  updateInvoice,
  updateInvoiceStatus
};
