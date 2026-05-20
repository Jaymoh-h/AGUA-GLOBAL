const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const paymentChannels = ["cash", "bank", "mpesa_paybill", "manual_adjustment"];

const normalizeChannel = (value) => {
  const raw = String(value || "cash").trim().toLowerCase();
  if (raw === "mpesa" || raw === "m_pesa" || raw === "mobile_money" || raw === "paybill") return "mpesa_paybill";
  if (paymentChannels.includes(raw)) return raw;
  return null;
};

const normalizeImportHeader = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const readImportValue = (row, keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== "");

const parseCsv = (csvText) => {
  const text = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new ApiError(400, "CSV content is required.");

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (quoted) throw new ApiError(400, "CSV has an unclosed quoted value.");
  if (rows.length < 2) throw new ApiError(400, "CSV must include a header row and at least one expense row.");

  const headers = rows[0].map(normalizeImportHeader);
  return rows.slice(1).map((values, index) => {
    const parsed = { rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      parsed[header] = values[headerIndex] || "";
    });
    return parsed;
  });
};

const resolveExpenseImportRows = (csvText, { commitMode = false } = {}) =>
  parseCsv(csvText).map((row) => {
    const errors = [];
    const expenseDate = readImportValue(row, ["expense_date", "date"]);
    const category = readImportValue(row, ["category", "expense_category"]);
    const vendor = readImportValue(row, ["vendor", "supplier", "payee"]);
    const description = readImportValue(row, ["description", "details", "item"]);
    const amountValue = readImportValue(row, ["amount", "expense_amount", "cost"]);
    const channel = normalizeChannel(readImportValue(row, ["payment_channel", "channel", "method"]));
    const reference = readImportValue(row, ["reference", "external_reference", "transaction_code"]);
    const receiptNumber = readImportValue(row, ["receipt_number", "receipt", "receipt_no"]);
    const notes = readImportValue(row, ["notes", "note"]);
    const amount = Number(amountValue);

    if (!expenseDate || !isDateOnly(expenseDate)) errors.push("Expense date must use YYYY-MM-DD.");
    if (!category) errors.push("Category is required.");
    if (!description) errors.push("Description is required.");
    if (amountValue === undefined || amountValue === "") {
      errors.push("Amount is required.");
    } else if (!Number.isFinite(amount) || amount <= 0) {
      errors.push("Amount must be greater than zero.");
    }
    if (!channel) errors.push("Payment channel must be cash, bank, mpesa_paybill, or manual_adjustment.");

    return {
      rowNumber: row.rowNumber,
      expense_date: expenseDate || "",
      category: category || "",
      vendor: vendor || "",
      description: description || "",
      amount: amountValue === undefined || amountValue === "" ? "" : amount,
      payment_channel: channel || "",
      reference: reference || "",
      receipt_number: receiptNumber || "",
      notes: notes || "",
      errors,
      warnings: [],
      status: errors.length ? "invalid" : commitMode ? "ready" : "valid"
    };
  });

const createExpenseRecord = async (client, req, payload, { auditReason = null } = {}) => {
  const amount = Number(payload.amount);
  const channel = normalizeChannel(payload.payment_channel);

  if (!payload.expense_date || !payload.category || !payload.description || payload.amount === undefined) {
    throw new ApiError(400, "Expense date, category, description, and amount are required.");
  }
  if (!isDateOnly(payload.expense_date)) throw new ApiError(400, "Expense date must use YYYY-MM-DD.");
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Amount must be greater than zero.");
  if (!channel) throw new ApiError(400, "Payment channel is invalid.");

  const { rows } = await client.query(
    `INSERT INTO expenses (
      expense_date, category, vendor, description, amount, payment_channel,
      reference, receipt_number, notes, recorded_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      payload.expense_date,
      payload.category,
      payload.vendor || null,
      payload.description,
      amount,
      channel,
      payload.reference || null,
      payload.receipt_number || null,
      payload.notes || null,
      req.user.id
    ]
  );

  await recordAuditEvent(client, {
    req,
    action: "expense.created",
    entityType: "expense",
    entityId: rows[0].id,
    afterData: rows[0],
    reason: auditReason
  });

  return rows[0];
};

const listExpenses = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, u.name AS recorded_by_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.recorded_by
     ORDER BY e.expense_date DESC, e.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const createExpense = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expense = await createExpenseRecord(client, req, req.body);
    await client.query("COMMIT");
    res.status(201).json(expense);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const previewExpenseImport = asyncHandler(async (req, res) => {
  const rows = resolveExpenseImportRows(req.body.csv);
  res.json({
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => !row.errors.length).length,
      invalid: rows.filter((row) => row.errors.length).length,
      totalAmount: rows.filter((row) => !row.errors.length).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    }
  });
});

const commitExpenseImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = resolveExpenseImportRows(req.body.csv, { commitMode: true });
    const invalidRows = rows.filter((row) => row.errors.length);
    if (invalidRows.length) {
      throw new ApiError(400, "CSV still has invalid rows. Preview and fix the errors before import.");
    }

    const imported = [];
    for (const row of rows) {
      const expense = await createExpenseRecord(client, req, row, {
        auditReason: `CSV expense import row ${row.rowNumber}`
      });
      imported.push({ rowNumber: row.rowNumber, expense_id: expense.id, amount: expense.amount });
    }

    await recordAuditEvent(client, {
      req,
      action: "expense_import.committed",
      entityType: "expense_import",
      afterData: {
        totalRows: rows.length,
        importedRows: imported.length,
        totalAmount: imported.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      }
    });

    await client.query("COMMIT");
    res.status(201).json({
      imported,
      summary: {
        total: rows.length,
        imported: imported.length,
        totalAmount: imported.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  commitExpenseImport,
  createExpense,
  createExpenseRecord,
  listExpenses,
  previewExpenseImport
};
