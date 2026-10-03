const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export const parseStatementCsv = (csv) => {
  const parsed = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      parsed.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  row.push(cell);
  parsed.push(row);
  const nonEmptyRows = parsed.filter((cells) => cells.some((value) => String(value || "").trim()));
  if (!nonEmptyRows.length) return { headers: [], rows: [] };

  const seenHeaders = new Map();
  const headers = nonEmptyRows[0].map((header, index) => {
    const baseHeader = String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = seenHeaders.get(baseHeader) || 0;
    seenHeaders.set(baseHeader, count + 1);
    return count ? `${baseHeader} ${count + 1}` : baseHeader;
  });

  return {
    headers,
    rows: nonEmptyRows.slice(1).map((cells, rowIndex) => {
      const record = { _rowNumber: rowIndex + 2 };
      headers.forEach((header, index) => {
        record[header] = cells[index] || "";
      });
      return record;
    })
  };
};

export const detectStatementMapping = (headers) =>
  headers.reduce((mapping, header) => {
    const compact = normalizeText(header).replaceAll(" ", "");
    if (/(transaction|posting|posted|value)?date/.test(compact)) return { ...mapping, [header]: "payment_date" };
    if (/(credit|paidin|deposit|amountpaid|paymentamount|amount)/.test(compact)) return { ...mapping, [header]: "amount" };
    if (/(accountnumber|accountno|accnumber|accno|customeraccount)/.test(compact)) return { ...mapping, [header]: "acc_number" };
    if (/(transactionid|transactionref|reference|refno|chequeno|receiptno)/.test(compact)) return { ...mapping, [header]: "external_reference" };
    if (/(transactionstatus|paymentstatus|mpesastatus|status|state|result)/.test(compact)) return { ...mapping, [header]: "transaction_status" };
    if (/(payer|paidby|customer|accountname|sender|name)/.test(compact)) return { ...mapping, [header]: "received_from" };
    if (/(narration|description|details|particulars|memo)/.test(compact)) return { ...mapping, [header]: "narration" };
    if (/note/.test(compact)) return { ...mapping, [header]: "notes" };
    return { ...mapping, [header]: "" };
  }, {});

export const readMappedStatementValue = (row, mapping, field) => {
  const header = Object.keys(mapping).find((key) => mapping[key] === field);
  return header ? String(row[header] || "").trim() : "";
};

export const normalizeStatementAmount = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const negative = /^\(.*\)$/.test(text) || /\bdr\b/i.test(text);
  const number = Number(text.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
  return negative ? "" : number.toFixed(2).replace(/\.00$/, "");
};

export const normalizeStatementDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const dateMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dateMatch) {
    let [, day, month, year] = dateMatch;
    if (Number(month) > 12 && Number(day) <= 12) [day, month] = [month, day];
    return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export const findCustomerCandidates = (paymentRow, customers, standingOrders = []) => {
  const text = [paymentRow.external_reference, paymentRow.received_from, paymentRow.narration, paymentRow.notes, paymentRow.receipt_number].join(" ");
  const normalized = normalizeText(text);
  const digitText = digitsOnly(text);
  return customers
    .map((customer) => {
      const reasons = [];
      let score = 0;
      const account = normalizeText(customer.acc_number);
      const phone = digitsOnly(customer.phone);
      const nameTokens = normalizeText(customer.name).split(" ").filter((token) => token.length > 2);
      const standingOrderReference = (standingOrders || []).find((order) => {
        const reference = normalizeText(order.mandate_reference);
        return Number(order.customer_id) === Number(customer.id) && order.status === "active" && reference.length >= 3 && normalized.includes(reference);
      })?.mandate_reference;
      if (standingOrderReference) {
        score = Math.max(score, 100);
        reasons.push("standing order");
      }
      if (account && normalized.includes(account)) {
        score = Math.max(score, 100);
        reasons.push("account");
      }
      if (phone.length >= 7 && digitText.includes(phone.slice(-9))) {
        score = Math.max(score, 85);
        reasons.push("phone");
      }
      const hits = nameTokens.filter((token) => normalized.includes(token)).length;
      if (hits === nameTokens.length && hits >= 2) {
        score = Math.max(score, 75);
        reasons.push("name");
      } else if (hits >= 2) {
        score = Math.max(score, 55 + hits * 5);
        reasons.push("partial name");
      }
      return { customer, score, reason: reasons.join(", ") };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
};

export const isCompletedMpesaTransaction = (value) =>
  ["completed", "complete", "success", "successful", "posted", "settled"].includes(normalizeText(value).replaceAll(" ", "_"));

export const statementRowStatus = (row) => {
  if (row.ignored) return "ignored";
  if (!row.payment_date || !row.amount || !row.external_reference) return "invalid";
  if (row.payment_channel === "mpesa_paybill" && !isCompletedMpesaTransaction(row.transaction_status)) return "needs_review";
  return row.acc_number ? "ready" : "needs_match";
};

export const statementConfidenceLabel = (score) => {
  if (score >= 85) return "High";
  if (score >= 60) return "Medium";
  return score > 0 ? "Low" : "Manual";
};
