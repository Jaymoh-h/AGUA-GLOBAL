import { CircleDollarSign, Download, Eye, FileUp, Printer, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AuditPanel from "../components/AuditPanel";
import { EmptyTableRow } from "../components/EmptyState";
import TableControls, { useTableControls } from "../components/TableControls";
import { api, assetUrl } from "../services/api";
import { downloadCsvRows, downloadCsvTemplate, rowsToCsv } from "../utils/csvTemplate";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
const accountPositionMoney = (value) => money(Math.abs(Number(value || 0)));
const paymentImportHeaders = [
  "acc_number",
  "payment_date",
  "amount",
  "payment_channel",
  "receipt_number",
  "external_reference",
  "received_from",
  "bill_number",
  "notes"
];
const bankTemplateStorageKey = "agua-bank-statement-template-v1";
const bankProfilesStorageKey = "agua-bank-statement-profiles-v1";
const bankHistoryStorageKey = "agua-bank-statement-history-v1";
const bankFieldOptions = [
  { key: "", label: "Select field" },
  { key: "payment_date", label: "Payment date" },
  { key: "amount", label: "Amount paid" },
  { key: "external_reference", label: "Reference / transaction ID" },
  { key: "received_from", label: "Payer name" },
  { key: "narration", label: "Narration / description" },
  { key: "receipt_number", label: "Receipt number" },
  { key: "notes", label: "Notes" }
];

let pdfJsLoader;

const loadPdfJs = async () => {
  if (!pdfJsLoader) {
    pdfJsLoader = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]).then(
      ([pdfjsLib, worker]) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjsLib;
      }
    );
  }
  return pdfJsLoader;
};

const loadStoredBankMapping = () => {
  try {
    return JSON.parse(window.localStorage.getItem(bankTemplateStorageKey) || "{}");
  } catch {
    return {};
  }
};

const loadStoredBankProfiles = () => {
  try {
    return JSON.parse(window.localStorage.getItem(bankProfilesStorageKey) || "{}");
  } catch {
    return {};
  }
};

const loadStoredBankHistory = () => {
  try {
    return JSON.parse(window.localStorage.getItem(bankHistoryStorageKey) || "[]");
  } catch {
    return [];
  }
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
const bankDatePattern = /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/;
const bankAmountPattern = /(?:kes|ksh|cr)?\s*[\d,]+\.\d{2}\b|(?:kes|ksh|cr)?\s*[\d,]{4,}\b/i;

const parseCsvRows = (csv) => {
  const parsed = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      parsed.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
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

  const rows = nonEmptyRows.slice(1).map((cells, rowIndex) => {
    const record = { _rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = cells[index] || "";
    });
    return record;
  });

  return { headers, rows };
};

const pdfReadErrorMessage = (err, hasPassword) => {
  if (err?.name === "PasswordException" || /password/i.test(err?.message || "")) {
    return hasPassword
      ? "The PDF password was rejected. Check the password and try again."
      : "This PDF is password-protected. Enter the statement password and retry.";
  }
  if (/permission|encrypted|protected|copy/i.test(err?.message || "")) {
    return "The PDF opened with restrictions that blocked text extraction. Use a bank CSV export, an unlocked copy, or paste the statement text into the box.";
  }
  return `Could not read the PDF statement: ${err.message}`;
};

const splitPdfLineIntoCells = (items) => {
  const cells = [];

  items
    .sort((left, right) => left.x - right.x)
    .forEach((item) => {
      const text = String(item.text || "").trim();
      if (!text) return;
      const width = Number(item.width || text.length * 5);
      const end = item.x + width;
      const current = cells[cells.length - 1];
      const gap = current ? item.x - current.end : 0;

      if (!current || gap > 18) {
        cells.push({ x: item.x, end, text });
      } else {
        current.text = `${current.text}${gap > 2 ? " " : ""}${text}`.replace(/\s+/g, " ").trim();
        current.end = Math.max(current.end, end);
      }
    });

  return cells;
};

const makeUniqueHeaders = (headers) => {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
};

const pdfHeaderScore = (line) => {
  const text = normalizeText(line.text);
  return [
    /date/.test(text),
    /description|narration|particular|detail|remarks/.test(text),
    /reference|ref|transaction/.test(text),
    /credit|deposit|paid|amount/.test(text),
    /balance/.test(text)
  ].filter(Boolean).length;
};

const lineLooksLikePayment = (line) => bankDatePattern.test(line.text) && bankAmountPattern.test(line.text);

const ignoredPdfContinuationLine = (line) => {
  const text = normalizeText(line.text);
  if (!text) return true;
  return /^(opening|closing|available|ledger|brought forward|carried forward|total|balance)/.test(text);
};

const preferredContinuationIndex = (headers) => {
  const scored = headers.map((header, index) => {
    const text = normalizeText(header);
    let score = index === 0 ? 1 : 0;
    if (/description|narration|particular|detail|remarks|payer|name/.test(text)) score += 5;
    if (/reference|ref|transaction/.test(text)) score += 2;
    if (/date|amount|credit|debit|balance/.test(text)) score -= 3;
    return { index, score };
  });
  return scored.sort((left, right) => right.score - left.score)[0]?.index || 0;
};

const nearestPdfColumnIndex = (cell, anchors) =>
  anchors.reduce((bestIndex, anchor, anchorIndex) => {
    const bestDistance = Math.abs(cell.x - anchors[bestIndex]);
    const currentDistance = Math.abs(cell.x - anchor);
    return currentDistance < bestDistance ? anchorIndex : bestIndex;
  }, 0);

const appendPdfCellToRow = (row, header, value) => {
  row[header] = [row[header], value].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
};

const typicalPdfLineGap = (lines) => {
  const gaps = [];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (previous.pageNumber !== current.pageNumber) continue;
    const gap = Math.abs(previous.y - current.y);
    if (gap >= 4 && gap <= 40) gaps.push(gap);
  }
  if (!gaps.length) return 12;
  return gaps.sort((left, right) => left - right)[Math.floor(gaps.length / 2)];
};

const appendPdfContinuationLine = (row, line, headers, anchors, continuationIndex) => {
  line.cells.forEach((cell) => {
    const nearestIndex = nearestPdfColumnIndex(cell, anchors);
    const targetIndex = nearestIndex <= continuationIndex + 1 ? continuationIndex : nearestIndex;
    appendPdfCellToRow(row, headers[targetIndex], cell.text);
  });
};

const buildPdfTableCsv = (lines) => {
  const headerIndex = lines.findIndex((line) => line.cells.length >= 3 && pdfHeaderScore(line) >= 2);
  if (headerIndex === -1) return null;

  const headerLine = lines[headerIndex];
  const headers = makeUniqueHeaders(headerLine.cells.map((cell) => cell.text));
  const anchors = headerLine.cells.map((cell) => cell.x);
  const continuationIndex = preferredContinuationIndex(headers);
  const bodyLines = lines.slice(headerIndex + 1).filter((line) => line.cells.length && !ignoredPdfContinuationLine(line));
  const lineGap = typicalPdfLineGap(bodyLines);
  const continuationDistance = Math.max(lineGap * 1.8, 18);
  const paymentIndexes = bodyLines
    .map((line, index) => (lineLooksLikePayment(line) ? index : -1))
    .filter((index) => index >= 0);
  const continuationByPaymentIndex = new Map(paymentIndexes.map((index) => [index, []]));
  const rows = [];

  bodyLines.forEach((line, index) => {
    if (lineLooksLikePayment(line)) return;
    const nearestPaymentIndex = paymentIndexes
      .filter((paymentIndex) => bodyLines[paymentIndex].pageNumber === line.pageNumber)
      .map((paymentIndex) => ({
        paymentIndex,
        distance: Math.abs(bodyLines[paymentIndex].y - line.y)
      }))
      .filter((candidate) => candidate.distance <= continuationDistance)
      .sort((left, right) => left.distance - right.distance)[0]?.paymentIndex;

    if (nearestPaymentIndex !== undefined) {
      continuationByPaymentIndex.get(nearestPaymentIndex)?.push({ index, line });
    }
  });

  paymentIndexes.forEach((paymentIndex) => {
    const line = bodyLines[paymentIndex];
    const row = { _rowNumber: paymentIndex + headerIndex + 2 };
    headers.forEach((header) => {
      row[header] = "";
    });

    continuationByPaymentIndex
      .get(paymentIndex)
      ?.filter((item) => item.index < paymentIndex)
      .sort((left, right) => left.index - right.index)
      .forEach((item) => appendPdfContinuationLine(row, item.line, headers, anchors, continuationIndex));

    line.cells.forEach((cell) => {
      const nearestIndex = nearestPdfColumnIndex(cell, anchors);
      const header = headers[nearestIndex];
      appendPdfCellToRow(row, header, cell.text);
    });

    continuationByPaymentIndex
      .get(paymentIndex)
      ?.filter((item) => item.index > paymentIndex)
      .sort((left, right) => left.index - right.index)
      .forEach((item) => appendPdfContinuationLine(row, item.line, headers, anchors, continuationIndex));

    rows.push(row);
  });

  if (!rows.length) return null;

  return {
    headers,
    rows,
    csv: rowsToCsv(
      headers.map((header) => ({ header, value: (row) => row[header] || "" })),
      rows
    )
  };
};

const buildPdfFallbackCsv = (rawText) => {
  const parsed = parsePdfPaymentLines(rawText);
  if (!parsed.rows.length) return null;
  return {
    ...parsed,
    csv: rowsToCsv(
      parsed.headers.map((header) => ({ header, value: (row) => row[header] || "" })),
      parsed.rows
    )
  };
};

const extractPdfStatementTable = async (file, password = "") => {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data, password: password || undefined }).promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = new Map();

    content.items.forEach((item) => {
      const text = String(item.str || "").trim();
      if (!text) return;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const line = pageLines.get(y) || [];
      line.push({ x, text, width: item.width || 0 });
      pageLines.set(y, line);
    });

    lines.push(
      ...[...pageLines.entries()]
        .sort((left, right) => right[0] - left[0])
        .map(([y, items]) => {
          const cells = splitPdfLineIntoCells(items);
          return {
            pageNumber,
            y,
            cells,
            text: cells.map((cell) => cell.text).join(" ")
          };
        })
    );
  }

  const rawText = lines.map((line) => line.text).join("\n");
  const table = buildPdfTableCsv(lines) || buildPdfFallbackCsv(rawText);
  return { rawText, table };
};

const parsePdfPaymentLines = (text) => {
  const rows = [];
  const headers = ["payment_date", "narration", "external_reference", "amount"];

  text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const dateMatch = line.match(bankDatePattern);
      if (!dateMatch) return;

      const afterDate = line.slice(dateMatch.index + dateMatch[0].length).trim();
      const amountMatches = [...afterDate.matchAll(new RegExp(bankAmountPattern, "gi"))];
      if (!amountMatches.length) return;

      const amountMatch = amountMatches[amountMatches.length - 1];
      const beforeAmount = afterDate.slice(0, amountMatch.index).trim();
      const referenceMatch = beforeAmount.match(/\b[A-Z0-9]{6,}\b/g);
      const reference = referenceMatch?.[referenceMatch.length - 1] || "";
      const narration = reference ? beforeAmount.replace(reference, "").replace(/\s+/g, " ").trim() : beforeAmount;

      rows.push({
        _rowNumber: index + 1,
        payment_date: dateMatch[0],
        narration: narration || beforeAmount || line,
        external_reference: reference,
        amount: amountMatch[0]
      });
    });

  return { headers, rows };
};

const detectBankMapping = (headers) =>
  headers.reduce((mapping, header) => {
    const compact = normalizeText(header).replaceAll(" ", "");
    if (/(transaction|posting|posted|value)?date/.test(compact)) {
      return { ...mapping, [header]: "payment_date" };
    }
    if (/(credit|paidin|deposit|amountpaid|paymentamount|amount)/.test(compact)) {
      return { ...mapping, [header]: "amount" };
    }
    if (/(transactionid|transactionref|reference|refno|chequeno|receiptno)/.test(compact)) {
      return { ...mapping, [header]: "external_reference" };
    }
    if (/(payer|paidby|customer|accountname|sender|name)/.test(compact)) {
      return { ...mapping, [header]: "received_from" };
    }
    if (/(narration|description|details|particulars|memo)/.test(compact)) {
      return { ...mapping, [header]: "narration" };
    }
    if (/note/.test(compact)) {
      return { ...mapping, [header]: "notes" };
    }
    return { ...mapping, [header]: "" };
  }, {});

const readMappedBankValue = (row, mapping, field) => {
  const header = Object.keys(mapping).find((key) => mapping[key] === field);
  return header ? String(row[header] || "").trim() : "";
};

const normalizeBankAmount = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const negative = /^\(.*\)$/.test(text) || /\bdr\b/i.test(text);
  const number = Number(text.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
  return negative ? "" : number.toFixed(2).replace(/\.00$/, "");
};

const normalizeBankDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dateMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dateMatch) {
    let [, day, month, year] = dateMatch;
    if (Number(month) > 12 && Number(day) <= 12) {
      [day, month] = [month, day];
    }
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const findCustomerCandidates = (paymentRow, customers) => {
  const text = [
    paymentRow.external_reference,
    paymentRow.received_from,
    paymentRow.narration,
    paymentRow.notes,
    paymentRow.receipt_number
  ].join(" ");
  const normalized = normalizeText(text);
  const digitText = digitsOnly(text);

  return customers
    .map((customer) => {
      const reasons = [];
      let score = 0;
      const account = normalizeText(customer.acc_number);
      const phone = digitsOnly(customer.phone);
      const nameTokens = normalizeText(customer.name)
        .split(" ")
        .filter((token) => token.length > 2);

      if (account && normalized.includes(account)) {
        score = Math.max(score, 100);
        reasons.push("account");
      }
      if (phone.length >= 7 && digitText.includes(phone.slice(-9))) {
        score = Math.max(score, 85);
        reasons.push("phone");
      }
      if (nameTokens.length) {
        const hits = nameTokens.filter((token) => normalized.includes(token)).length;
        if (hits === nameTokens.length && hits >= 2) {
          score = Math.max(score, 75);
          reasons.push("name");
        } else if (hits >= 2) {
          score = Math.max(score, 55 + hits * 5);
          reasons.push("partial name");
        }
      }

      return { customer, score, reason: reasons.join(", ") };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
};

const bankRowStatus = (row) => {
  if (row.ignored) return "ignored";
  if (!row.payment_date || !row.amount) return "invalid";
  if (!row.acc_number) return "needs_match";
  return "ready";
};

const bankConfidenceLabel = (score) => {
  if (score >= 85) return "High";
  if (score >= 60) return "Medium";
  if (score > 0) return "Low";
  return "Manual";
};

function PaymentsPage({ user }) {
  const [payments, setPayments] = useState([]);
  const [suspenseItems, setSuspenseItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [csvText, setCsvText] = useState("acc_number,payment_date,amount,payment_channel,receipt_number,external_reference,received_from,notes\n");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [bankCsvText, setBankCsvText] = useState("");
  const [bankHeaders, setBankHeaders] = useState([]);
  const [bankRows, setBankRows] = useState([]);
  const [bankMapping, setBankMapping] = useState(loadStoredBankMapping);
  const [bankReviewRows, setBankReviewRows] = useState([]);
  const [bankProfiles, setBankProfiles] = useState(loadStoredBankProfiles);
  const [bankProfileName, setBankProfileName] = useState("Default");
  const [bankImportHistory, setBankImportHistory] = useState(loadStoredBankHistory);
  const [bankPdfFile, setBankPdfFile] = useState(null);
  const [bankPdfPassword, setBankPdfPassword] = useState("");
  const [bankPdfNeedsPassword, setBankPdfNeedsPassword] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_channel: "cash",
    receipt_number: "",
    external_reference: "",
    received_from: "",
    notes: ""
  });
  const [editingId, setEditingId] = useState(null);
  const [channelFilter, setChannelFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [adjustmentForm, setAdjustmentForm] = useState({
    customer_id: "",
    adjustment_type: "credit",
    amount: "",
    adjustment_date: new Date().toISOString().slice(0, 10),
    reason: ""
  });
  const [message, setMessage] = useState("");
  const selectedCustomer = customers.find((customer) => Number(customer.id) === Number(form.customer_id));
  const selectedBalance = Number(selectedCustomer?.balance_due || 0);
  const importReady = useMemo(
    () => importPreview?.rows?.length > 0 && importPreview.summary.invalid === 0,
    [importPreview]
  );
  const referenceLabel = {
    cash: "Cash reference",
    bank: "Bank slip/reference",
    mpesa_paybill: "M-Pesa transaction code",
    manual_adjustment: "Adjustment reference"
  }[form.payment_channel] || "Reference";
  const receiptMoney = (value) =>
    `${businessSettings?.default_currency || "KES"} ${Number(value || 0).toLocaleString()}`;
  const receiptPositionMoney = (value) =>
    `${businessSettings?.default_currency || "KES"} ${Math.abs(Number(value || 0)).toLocaleString()}`;

  const load = async () => {
    const [paymentRows, suspenseRows, customerRows, businessRow, adjustmentRows] = await Promise.all([
      api.payments.list(),
      api.payments.suspense(),
      api.customers.list(),
      api.businessSettings.get(),
      api.adjustments.list()
    ]);
    setPayments(paymentRows);
    setSuspenseItems(suspenseRows);
    setCustomers(customerRows);
    setBusinessSettings(businessRow);
    setAdjustments(adjustmentRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setAdjustmentField = (field, value) => setAdjustmentForm((current) => ({ ...current, [field]: value }));

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const loadBankStatement = (text) => {
    setMessage("");
    const parsed = parseCsvRows(text);
    if (!parsed.headers.length) {
      setBankHeaders([]);
      setBankRows([]);
      setBankReviewRows([]);
      setMessage("No bank statement rows were found in the CSV.");
      return;
    }

    const detectedMapping = detectBankMapping(parsed.headers);
    setBankHeaders(parsed.headers);
    setBankRows(parsed.rows);
    setBankReviewRows([]);
    setBankMapping((current) =>
      parsed.headers.reduce(
        (next, header) => ({
          ...next,
          [header]: current[header] ?? detectedMapping[header] ?? ""
        }),
        {}
      )
    );
    setMessage(`Loaded ${parsed.rows.length} bank statement row(s). Map the columns, then generate payment rows.`);
  };

  const loadBankPdfStatement = async (file) => {
    setMessage("");
    setBankHeaders([]);
    setBankRows([]);
    setBankReviewRows([]);
    setBankPdfNeedsPassword(false);
    try {
      const extracted = await extractPdfStatementTable(file, bankPdfPassword);

      if (!extracted.rawText.trim()) {
        setMessage("The PDF opened, but no extractable text was found. It may be copy-restricted or scanned. Use a bank CSV export, an unlocked copy, or paste statement text into the box.");
        return;
      }

      if (!extracted.table?.rows.length) {
        setBankCsvText(extracted.rawText);
        setMessage("PDF text was extracted, but no table-like payment rows were detected. The content box now shows the raw text so you can inspect it, use a bank CSV export, or share a sample layout so we can tune the parser.");
        return;
      }

      setBankCsvText(extracted.table.csv);
      setBankHeaders(extracted.table.headers);
      setBankRows(extracted.table.rows);
      setBankMapping(bankProfiles[bankProfileName] || detectBankMapping(extracted.table.headers));
      setMessage(`Extracted ${extracted.table.rows.length} table row(s) from the PDF. The content box is now CSV-like; map the columns, then generate payment rows.`);
    } catch (err) {
      const needsPassword = err?.name === "PasswordException" || /password/i.test(err?.message || "");
      setBankPdfNeedsPassword(needsPassword);
      setMessage(pdfReadErrorMessage(err, Boolean(bankPdfPassword)));
    }
  };

  const handleBankCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setBankPdfFile(file);
      await loadBankPdfStatement(file);
      return;
    }
    setBankPdfFile(null);
    setBankPdfNeedsPassword(false);
    const text = await file.text();
    setBankCsvText(text);
    loadBankStatement(text);
  };

  const updateBankMapping = (header, field) => {
    setBankMapping((current) => ({ ...current, [header]: field }));
    setBankReviewRows([]);
  };

  const applyBankProfile = (name) => {
    setBankProfileName(name);
    if (bankProfiles[name]) {
      setBankMapping(bankProfiles[name]);
      setBankReviewRows([]);
      setMessage(`Loaded ${name} bank mapping profile.`);
    }
  };

  const saveBankTemplate = () => {
    const name = bankProfileName.trim() || "Default";
    const nextProfiles = { ...bankProfiles, [name]: bankMapping };
    setBankProfiles(nextProfiles);
    setBankProfileName(name);
    window.localStorage.setItem(bankProfilesStorageKey, JSON.stringify(nextProfiles));
    window.localStorage.setItem(bankTemplateStorageKey, JSON.stringify(bankMapping));
    setMessage(`${name} bank statement mapping saved on this browser.`);
  };

  const makeBankReviewRow = (paymentRow, id, sourceRowNumber) => {
    const normalizedPaymentRow = {
      ...paymentRow,
      payment_date: normalizeBankDate(paymentRow.payment_date),
      amount: normalizeBankAmount(paymentRow.amount),
      payment_channel: "bank",
      bill_number: ""
    };
    const candidates = findCustomerCandidates(normalizedPaymentRow, customers);
    const directCustomer = paymentRow.acc_number
      ? customers.find((customer) => customer.acc_number === paymentRow.acc_number)
      : null;
    const selectedCandidate = candidates[0]?.score >= 70 ? candidates[0] : null;
    const selectedCustomer = directCustomer || selectedCandidate?.customer;

    return {
      ...normalizedPaymentRow,
      id,
      source_row_number: sourceRowNumber,
      acc_number: selectedCustomer?.acc_number || "",
      customer_name: selectedCustomer?.name || "",
      candidate_score: directCustomer ? 100 : candidates[0]?.score || 0,
      candidate_reason: directCustomer ? "manual account" : candidates[0]?.reason || "",
      ignored: false,
      candidates: candidates.map((candidate) => ({
        id: candidate.customer.id,
        acc_number: candidate.customer.acc_number,
        name: candidate.customer.name,
        score: candidate.score,
        reason: candidate.reason
      }))
    };
  };

  const generateBankPaymentRows = () => {
    setMessage("");
    if (!bankRows.length) {
      setMessage("Load a bank statement PDF or CSV first.");
      return;
    }
    if (!Object.values(bankMapping).includes("amount") || !Object.values(bankMapping).includes("payment_date")) {
      setMessage("Map at least the payment date and amount columns before generating rows.");
      return;
    }

    const reviewRows = bankRows.map((row, index) => {
      return makeBankReviewRow({
        payment_date: readMappedBankValue(row, bankMapping, "payment_date"),
        amount: readMappedBankValue(row, bankMapping, "amount"),
        receipt_number: readMappedBankValue(row, bankMapping, "receipt_number"),
        external_reference: readMappedBankValue(row, bankMapping, "external_reference"),
        received_from: readMappedBankValue(row, bankMapping, "received_from"),
        narration: readMappedBankValue(row, bankMapping, "narration"),
        notes: readMappedBankValue(row, bankMapping, "notes")
      }, `${row._rowNumber}-${index}`, row._rowNumber);
    });

    setBankReviewRows(reviewRows);
    const readyRows = reviewRows.filter((row) => row.acc_number && row.payment_date && row.amount);
    setMessage(
      `${readyRows.length} of ${reviewRows.length} bank row(s) matched and look ready. Review unmatched rows before importing.`
    );
  };

  const updateBankReviewAccount = (index, accNumber) => {
    const customer = customers.find((item) => item.acc_number === accNumber);
    setBankReviewRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              acc_number: accNumber,
              customer_name: customer?.name || ""
            }
          : row
      )
    );
  };

  const updateBankReviewField = (index, field, value) => {
    setBankReviewRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [field]: value };
        if (["external_reference", "received_from", "narration", "notes"].includes(field)) {
          const candidates = findCustomerCandidates(nextRow, customers);
          return {
            ...nextRow,
            candidate_score: candidates[0]?.score || 0,
            candidate_reason: candidates[0]?.reason || "",
            candidates: candidates.map((candidate) => ({
              id: candidate.customer.id,
              acc_number: candidate.customer.acc_number,
              name: candidate.customer.name,
              score: candidate.score,
              reason: candidate.reason
            }))
          };
        }
        return nextRow;
      })
    );
  };

  const useBankPaymentRows = () => {
    const readyRows = bankReviewRows.filter((row) => !row.ignored && row.acc_number && row.payment_date && row.amount);
    if (!readyRows.length) {
      setMessage("No ready bank payment rows were found. Match accounts and check date/amount values first.");
      return;
    }
    const generatedCsv = rowsToCsv(
      paymentImportHeaders.map((header) => ({ header, value: (row) => row[header] || "" })),
      readyRows.map((row) => ({
        ...row,
        notes: [row.notes, row.narration].filter(Boolean).join(" | ")
      }))
    );
    setCsvText(generatedCsv);
    setImportPreview(null);
    const historyItem = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      source: bankPdfFile?.name || "Pasted statement / CSV",
      profile: bankProfileName.trim() || "Default",
      rows: readyRows.length,
      ignored: bankReviewRows.filter((row) => row.ignored).length,
      total: readyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    };
    const nextHistory = [historyItem, ...bankImportHistory].slice(0, 10);
    setBankImportHistory(nextHistory);
    window.localStorage.setItem(bankHistoryStorageKey, JSON.stringify(nextHistory));
    setMessage(`${readyRows.length} generated bank payment row(s) moved into the normal CSV importer. Preview before importing.`);
  };

  const previewImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.payments.previewImport(csvText);
      setImportPreview(preview);
      setMessage(
        preview.summary.invalid
          ? `${preview.summary.invalid} CSV row(s) need correction before import.`
          : `${preview.summary.valid} CSV row(s) ready to import.`
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const commitImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.payments.commitImport(csvText);
      setImportPreview(null);
      await load();
      setMessage(`Imported ${result.summary.imported} payment(s), total ${money(result.summary.totalAmount)}.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      let successMessage = editingId ? "Payment updated." : "Payment recorded.";
      if (editingId) {
        await api.payments.update(editingId, {
          amount: Number(form.amount),
          payment_date: form.payment_date,
          payment_channel: form.payment_channel,
          receipt_number: form.receipt_number,
          external_reference: form.external_reference,
          received_from: form.received_from,
          notes: form.notes
        });
      } else {
        const result = await api.payments.create({ ...form, customer_id: Number(form.customer_id), amount: Number(form.amount) });
        const creditAmount = Number(result.payment?.unallocated_amount || 0);
        if (result.allocations?.length > 1) {
          successMessage = `Receipt recorded across ${result.allocations.length} bills.`;
        }
        if (creditAmount > 0) {
          successMessage =
            result.allocations?.length > 1
              ? `${successMessage} ${money(creditAmount)} stored as customer credit.`
              : `Payment recorded. ${money(creditAmount)} stored as customer credit.`;
        }
      }
      setForm((current) => ({
        ...current,
        customer_id: "",
        amount: "",
        receipt_number: "",
        external_reference: "",
        received_from: "",
        notes: ""
      }));
      setEditingId(null);
      await load();
      setMessage(successMessage);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (payment) => {
    setEditingId(payment.id);
    setForm({
      customer_id: payment.customer_id || "",
      amount: payment.amount || "",
      payment_date: payment.payment_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      payment_channel: payment.payment_channel || payment.method || "cash",
      receipt_number: payment.receipt_number || "",
      external_reference: payment.external_reference || payment.reference || "",
      received_from: payment.received_from || "",
      notes: payment.notes || ""
    });
  };

  const openReceipt = async (payment) => {
    setMessage("");
    setLoadingReceipt(true);
    try {
      setReceiptDetail(await api.payments.get(payment.id));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoadingReceipt(false);
    }
  };

  const printReceipt = () => {
    setTimeout(() => window.print(), 50);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({
      customer_id: "",
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_channel: "cash",
      receipt_number: "",
      external_reference: "",
      received_from: "",
      notes: ""
    });
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.adjustments.create({
        ...adjustmentForm,
        customer_id: Number(adjustmentForm.customer_id),
        amount: Number(adjustmentForm.amount)
      });
      setAdjustmentForm({
        customer_id: "",
        adjustment_type: "credit",
        amount: "",
        adjustment_date: new Date().toISOString().slice(0, 10),
        reason: ""
      });
      await load();
      setMessage("Adjustment request submitted for admin approval.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const reviewAdjustment = async (adjustment, status) => {
    setMessage("");
    try {
      await api.adjustments.review(adjustment.id, {
        status,
        review_notes: status === "approved" ? "Approved from payments screen" : "Rejected from payments screen"
      });
      await load();
      setMessage(`Adjustment ${status}.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const voidPayment = async (payment) => {
    const reason = window.prompt(`Reason for voiding receipt ${payment.receipt_number || payment.id} to suspense:`);
    if (!reason?.trim()) return;
    setMessage("");
    try {
      await api.payments.voidToSuspense(payment.id, { reason: reason.trim() });
      await load();
      setReceiptDetail(null);
      setMessage("Payment voided and moved to suspense.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const reapplySuspense = async (item) => {
    const account = window.prompt(
      "Customer account to reapply to. Leave blank to use the original customer.",
      item.acc_number || ""
    );
    if (account === null) return;
    const customer = account.trim()
      ? customers.find((row) => row.acc_number.toLowerCase() === account.trim().toLowerCase())
      : customers.find((row) => Number(row.id) === Number(item.customer_id));
    if (!customer) {
      setMessage("Customer account was not found for suspense reapplication.");
      return;
    }
    const notes = window.prompt("Notes for this reapplication:", `Reapplied suspense item #${item.id}`) || "";
    setMessage("");
    try {
      await api.payments.reapplySuspense(item.id, {
        customer_id: customer.id,
        payment_date: item.payment_date?.slice(0, 10),
        payment_channel: item.payment_channel || "bank",
        external_reference: item.external_reference,
        received_from: item.received_from,
        notes
      });
      await load();
      setMessage("Suspense item reapplied as a new payment.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const discardSuspense = async (item) => {
    const reason = window.prompt(`Reason for discarding suspense item #${item.id}:`);
    if (!reason?.trim()) return;
    setMessage("");
    try {
      await api.payments.discardSuspense(item.id, { reason: reason.trim() });
      await load();
      setMessage("Suspense item discarded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const filteredPayments = payments.filter((payment) => {
    const dateValue = payment.payment_date?.slice(0, 10) || "";
    const channelMatch = !channelFilter || (payment.payment_channel || payment.method) === channelFilter;
    const fromMatch = !dateFromFilter || dateValue >= dateFromFilter;
    const toMatch = !dateToFilter || dateValue <= dateToFilter;
    return channelMatch && fromMatch && toMatch;
  });
  const paymentTable = useTableControls(filteredPayments, {
    searchFields: [
      "customer_name",
      "acc_number",
      "receipt_number",
      "amount",
      "payment_date",
      "payment_channel",
      "method",
      "external_reference",
      "reference",
      "bill_numbers"
    ]
  });
  const adjustmentTable = useTableControls(adjustments, {
    searchFields: [
      "customer_name",
      "acc_number",
      "adjustment_type",
      "amount",
      "adjustment_date",
      "reason",
      "status",
      "requested_by_name",
      "reviewed_by_name"
    ]
  });
  const suspenseTable = useTableControls(suspenseItems, {
    searchFields: [
      "receipt_number",
      "customer_name",
      "acc_number",
      "amount",
      "status",
      "reason",
      "external_reference",
      "reapplied_receipt_number"
    ]
  });
  const exportPayments = () => {
    downloadCsvRows(
      "payments.csv",
      [
        { header: "Receipt", value: (row) => row.receipt_number },
        { header: "Customer", value: (row) => row.customer_name },
        { header: "Account", value: (row) => row.acc_number },
        { header: "Amount", value: (row) => row.amount },
        { header: "Date", value: (row) => row.payment_date },
        { header: "Channel", value: (row) => row.payment_channel || row.method },
        { header: "Reference", value: (row) => row.external_reference || row.reference },
        { header: "Bills", value: (row) => row.bill_numbers },
        { header: "Credit", value: (row) => row.unallocated_amount }
      ],
      paymentTable.filteredRows
    );
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cash Office</p>
          <h2>Payments</h2>
        </div>
      </header>

      <section className="workspace-grid payments-workspace-grid">
        <div className="page-stack payments-entry-grid">
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>{editingId ? "Edit Payment" : "Record Payment"}</h3>
            </div>
            <label>
              Customer
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required disabled={Boolean(editingId)}>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name} - {accountPositionLabel(customer.balance_due).toLowerCase()}{" "}
                    {accountPositionMoney(customer.balance_due)}
                  </option>
                ))}
              </select>
            </label>
            {selectedCustomer ? (
              <div className="balance-note">
                <span>{accountPositionLabel(selectedBalance)}</span>
                <strong>{accountPositionMoney(selectedBalance)}</strong>
              </div>
            ) : null}
            <label>
              Amount
              <input
                value={form.amount}
                onChange={(event) => setField("amount", event.target.value)}
                type="number"
                min="1"
                required
              />
            </label>
            <label>
              Date
              <input value={form.payment_date} onChange={(event) => setField("payment_date", event.target.value)} type="date" />
            </label>
            <label>
              Channel
              <select value={form.payment_channel} onChange={(event) => setField("payment_channel", event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="mpesa_paybill">M-Pesa/paybill</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </label>
            <label>
              Receipt number
              <input value={form.receipt_number} onChange={(event) => setField("receipt_number", event.target.value)} placeholder="Auto-generated if blank" />
            </label>
            <label>
              {referenceLabel}
              <input value={form.external_reference} onChange={(event) => setField("external_reference", event.target.value)} />
            </label>
            <label>
              Received from
              <input value={form.received_from} onChange={(event) => setField("received_from", event.target.value)} />
            </label>
            <label>
              Notes
              <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows="3" />
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <button className="primary-button" type="submit">
              {editingId ? <Save size={17} /> : <CircleDollarSign size={17} />}
              {editingId ? "Save payment" : "Record payment"}
            </button>
            {editingId ? (
              <button type="button" onClick={cancelEdit}>
                Cancel edit
              </button>
            ) : null}
          </form>

          <form className="panel form-grid" onSubmit={submitAdjustment}>
            <div className="panel-heading">
              <div>
                <h3>Manual Credit/Debit</h3>
                <p className="muted">Accountants submit requests; admin approval posts the credit or debit.</p>
              </div>
            </div>
            <label>
              Customer
              <select
                value={adjustmentForm.customer_id}
                onChange={(event) => setAdjustmentField("customer_id", event.target.value)}
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={adjustmentForm.adjustment_type}
                onChange={(event) => setAdjustmentField("adjustment_type", event.target.value)}
              >
                <option value="credit">Credit customer</option>
                <option value="debit">Debit customer</option>
              </select>
            </label>
            <label>
              Amount
              <input
                value={adjustmentForm.amount}
                onChange={(event) => setAdjustmentField("amount", event.target.value)}
                type="number"
                min="1"
                required
              />
            </label>
            <label>
              Date
              <input
                value={adjustmentForm.adjustment_date}
                onChange={(event) => setAdjustmentField("adjustment_date", event.target.value)}
                type="date"
              />
            </label>
            <label>
              Reason
              <textarea
                value={adjustmentForm.reason}
                onChange={(event) => setAdjustmentField("reason", event.target.value)}
                rows="3"
                required
              />
            </label>
            <button className="primary-button" type="submit">
              Submit for approval
            </button>
          </form>

          <div className="panel form-grid bank-trainer-panel">
            <div className="panel-heading">
              <div>
                <h3>Bank Statement Trainer</h3>
                <p className="muted">Upload a PDF or CSV statement, match statement rows to customers, then send them to the normal payment importer.</p>
              </div>
              <button type="button" onClick={saveBankTemplate} disabled={!bankHeaders.length}>
                <Save size={16} />
                Save mapping
              </button>
            </div>
            <label>
              Bank statement file
              <input type="file" accept=".pdf,application/pdf,.csv,text/csv" onChange={handleBankCsvFile} />
            </label>
            <div className="filter-bar">
              <label>
                Bank profile
                <select value={bankProfileName} onChange={(event) => applyBankProfile(event.target.value)}>
                  <option value="Default">Default</option>
                  {Object.keys(bankProfiles).filter((name) => name !== "Default").map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profile name
                <input
                  value={bankProfileName}
                  onChange={(event) => setBankProfileName(event.target.value)}
                  placeholder="e.g. Equity, KCB, Cooperative"
                />
              </label>
            </div>
            <label>
              PDF password
              <input
                value={bankPdfPassword}
                onChange={(event) => setBankPdfPassword(event.target.value)}
                type="password"
                placeholder="Only needed for protected PDF statements"
              />
            </label>
            {bankPdfFile ? (
              <button type="button" onClick={() => loadBankPdfStatement(bankPdfFile)}>
                {bankPdfNeedsPassword ? "Retry with password" : "Re-read PDF"}
              </button>
            ) : null}
            <label>
              Extracted statement table or CSV content
              <textarea
                value={bankCsvText}
                onChange={(event) => {
                  setBankCsvText(event.target.value);
                  setBankHeaders([]);
                  setBankRows([]);
                  setBankReviewRows([]);
                }}
                rows="5"
                placeholder="Upload a PDF statement to extract a CSV-like table, or paste CSV content here and detect columns."
              />
            </label>
            <button type="button" onClick={() => loadBankStatement(bankCsvText)} disabled={!bankCsvText.trim()}>
              Detect columns from content
            </button>

            {bankHeaders.length ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bank column</th>
                        <th>Payment field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankHeaders.map((header) => (
                        <tr key={header}>
                          <td>{header}</td>
                          <td>
                            <select value={bankMapping[header] || ""} onChange={(event) => updateBankMapping(header, event.target.value)}>
                              {bankFieldOptions.map((option) => (
                                <option key={option.key || "select"} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="primary-button" type="button" onClick={generateBankPaymentRows}>
                  <Eye size={17} />
                  Generate payment rows
                </button>
              </>
            ) : null}

            {bankReviewRows.length ? (
              <>
                <div className="reading-context">
                  <div>
                    <span>Total rows</span>
                    <strong>{bankReviewRows.length}</strong>
                  </div>
                  <div>
                    <span>Ready</span>
                    <strong>{bankReviewRows.filter((row) => bankRowStatus(row) === "ready").length}</strong>
                  </div>
                  <div>
                    <span>Need match</span>
                    <strong>{bankReviewRows.filter((row) => bankRowStatus(row) === "needs_match").length}</strong>
                  </div>
                  <div>
                    <span>Ignored</span>
                    <strong>{bankReviewRows.filter((row) => row.ignored).length}</strong>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ignore</th>
                        <th>Row</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Narration</th>
                        <th>Account match</th>
                        <th>Confidence</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankReviewRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>
                            <input
                              checked={Boolean(row.ignored)}
                              onChange={(event) => updateBankReviewField(index, "ignored", event.target.checked)}
                              type="checkbox"
                              title="Ignore this statement row"
                            />
                          </td>
                          <td>{row.source_row_number}</td>
                          <td>
                            <input
                              value={row.payment_date || ""}
                              onChange={(event) => updateBankReviewField(index, "payment_date", event.target.value)}
                              type="date"
                            />
                          </td>
                          <td>
                            <input
                              value={row.amount || ""}
                              onChange={(event) => updateBankReviewField(index, "amount", event.target.value)}
                              type="number"
                              min="1"
                            />
                          </td>
                          <td>
                            <input
                              value={row.external_reference || ""}
                              onChange={(event) => updateBankReviewField(index, "external_reference", event.target.value)}
                            />
                            {row.received_from ? <small>{row.received_from}</small> : null}
                          </td>
                          <td>
                            <input
                              value={row.narration || ""}
                              onChange={(event) => updateBankReviewField(index, "narration", event.target.value)}
                            />
                          </td>
                          <td>
                            <select value={row.acc_number} onChange={(event) => updateBankReviewAccount(index, event.target.value)}>
                              <option value="">Select account</option>
                              {row.candidates.map((candidate) => (
                                <option key={`${row.id}-${candidate.id}`} value={candidate.acc_number}>
                                  {candidate.acc_number} - {candidate.name} ({candidate.score}%)
                                </option>
                              ))}
                              <option value="" disabled>
                                All customers
                              </option>
                              {customers.map((customer) => (
                                <option key={`${row.id}-customer-${customer.id}`} value={customer.acc_number}>
                                  {customer.acc_number} - {customer.name}
                                </option>
                              ))}
                            </select>
                            {row.candidate_reason ? <small>Matched by {row.candidate_reason}</small> : null}
                          </td>
                          <td>
                            <strong>{bankConfidenceLabel(row.candidate_score)}</strong>
                            {row.candidate_score ? <small>{row.candidate_score}%</small> : null}
                          </td>
                          <td>
                            <span className={`status status-${bankRowStatus(row)}`}>{bankRowStatus(row).replace("_", " ")}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={useBankPaymentRows}>
                  <FileUp size={17} />
                  Use generated payment CSV
                </button>
              </>
            ) : null}
            {bankImportHistory.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prepared</th>
                      <th>Source</th>
                      <th>Profile</th>
                      <th>Rows</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankImportHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{date(item.created_at)}</td>
                        <td>{item.source}</td>
                        <td>{item.profile}</td>
                        <td>
                          {item.rows}
                          {item.ignored ? <small>{item.ignored} ignored</small> : null}
                        </td>
                        <td>{money(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="panel form-grid payment-import-panel">
            <div className="panel-heading">
              <h3>Import Payments CSV</h3>
              <button
                type="button"
                onClick={() => downloadCsvTemplate("payments-import-template.csv", paymentImportHeaders)}
              >
                <Download size={16} />
                Template
              </button>
            </div>
            <label>
              CSV file
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </label>
            <label>
              CSV content
              <textarea
                value={csvText}
                onChange={(event) => {
                  setCsvText(event.target.value);
                  setImportPreview(null);
                }}
                rows="7"
                placeholder={"acc_number,payment_date,amount,payment_channel,receipt_number,external_reference,received_from,notes\nAG-0001,2026-06-30,1500,mpesa_paybill,MPESA-001,QWE123,Jane Wanjiku,June payment"}
              />
            </label>
            <p className="muted">
              Required columns: acc_number or customer_id, payment_date, amount. Optional: payment_channel, receipt_number, external_reference, received_from, bill_number, notes.
            </p>
            {importPreview ? (
              <div className="reading-context">
                <div>
                  <span>Total rows</span>
                  <strong>{importPreview.summary.total}</strong>
                </div>
                <div>
                  <span>Valid</span>
                  <strong>{importPreview.summary.valid}</strong>
                </div>
                <div>
                  <span>Total amount</span>
                  <strong>{money(importPreview.summary.totalAmount)}</strong>
                </div>
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={previewImport} disabled={importing}>
              <Eye size={17} />
              Preview CSV
            </button>
            <button type="button" onClick={commitImport} disabled={!importReady || importing}>
              <FileUp size={17} />
              Import valid rows
            </button>
          </div>
        </div>

        <div className="page-stack wide-panel">
          {importPreview ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>CSV Preview</h3>
                <FileUp size={18} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Account</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Channel</th>
                      <th>Receipt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.acc_number || "-"}</td>
                        <td>{row.customer_name || "-"}</td>
                        <td>{row.payment_date || "-"}</td>
                        <td>{row.amount === "" ? "-" : money(row.amount)}</td>
                        <td>{row.payment_channel}</td>
                        <td>{row.receipt_number || "Auto"}</td>
                        <td>
                          <span className={`status status-${row.status}`}>{row.status}</span>
                          {[...row.errors, ...row.warnings].map((item) => (
                            <small key={item}>{item}</small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {receiptDetail ? (
            <div className="panel print-surface receipt-print">
              <div className="receipt-actions screen-only">
                <button type="button" onClick={printReceipt}>
                  <Printer size={17} />
                  Print receipt
                </button>
                <button type="button" onClick={() => setReceiptDetail(null)} title="Close receipt">
                  <X size={17} />
                  Close
                </button>
              </div>

              <div className="receipt-header">
                {businessSettings?.logo_url ? (
                  <img className="receipt-logo" src={assetUrl(businessSettings.logo_url)} alt="Business logo" />
                ) : (
                  <div className="receipt-logo-mark">{businessSettings?.business_name?.slice(0, 2) || "AG"}</div>
                )}
                <div>
                  <h3>{businessSettings?.business_name || "Water Billing"}</h3>
                  {businessSettings?.legal_name ? <p>{businessSettings.legal_name}</p> : null}
                  {businessSettings?.physical_address ? <p>{businessSettings.physical_address}</p> : null}
                  <p>
                    {[businessSettings?.phone, businessSettings?.email].filter(Boolean).join(" | ")}
                  </p>
                  {businessSettings?.tax_pin ? <p>PIN: {businessSettings.tax_pin}</p> : null}
                </div>
              </div>

              <div className="receipt-title">
                <div>
                  <span>Receipt</span>
                  <strong>{receiptDetail.payment.receipt_number || `RCPT-${receiptDetail.payment.id}`}</strong>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{date(receiptDetail.payment.payment_date)}</strong>
                </div>
              </div>

              <div className="receipt-info-grid">
                <div>
                  <span>Received From</span>
                  <strong>{receiptDetail.payment.received_from || receiptDetail.payment.customer_name}</strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>{receiptDetail.payment.customer_name}</strong>
                  <small>{receiptDetail.payment.acc_number}</small>
                </div>
                <div>
                  <span>Channel</span>
                  <strong>{label(receiptDetail.payment.payment_channel || receiptDetail.payment.method)}</strong>
                </div>
                <div>
                  <span>Reference</span>
                  <strong>{receiptDetail.payment.external_reference || receiptDetail.payment.reference || "-"}</strong>
                </div>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Billing Month</th>
                    <th>Bill Total</th>
                    <th>Allocated</th>
                    <th>Bill Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptDetail.allocations.length ? (
                    receiptDetail.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td>{allocation.bill_number || `Bill ${allocation.bill_id}`}</td>
                        <td>{date(allocation.billing_month)}</td>
                        <td>{receiptMoney(allocation.bill_total)}</td>
                        <td>{receiptMoney(allocation.amount)}</td>
                        <td>{receiptMoney(allocation.balance_amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No open bills. Full amount stored as customer credit.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="receipt-total">
                <span>Total received</span>
                <strong>{receiptMoney(receiptDetail.payment.amount)}</strong>
              </div>
              <div className="receipt-total muted-total">
                <span>Allocated to bills</span>
                <strong>{receiptMoney(receiptDetail.payment.total_allocated_amount)}</strong>
              </div>
              <div className="receipt-total muted-total">
                <span>Customer credit</span>
                <strong>{receiptMoney(receiptDetail.payment.unallocated_amount)}</strong>
              </div>
              <div className="receipt-total muted-total">
                <span>{accountPositionLabel(receiptDetail.customerBalance)} after receipt</span>
                <strong>{receiptPositionMoney(receiptDetail.customerBalance)}</strong>
              </div>

              <div className="receipt-footer">
                {businessSettings?.paybill_number ? <p>Paybill: {businessSettings.paybill_number}</p> : null}
                {businessSettings?.till_number ? <p>Till: {businessSettings.till_number}</p> : null}
                {businessSettings?.receipt_footer_note ? <p>{businessSettings.receipt_footer_note}</p> : null}
                <small>Recorded by {receiptDetail.payment.recorded_by_name || "-"}</small>
              </div>
              <div className="screen-only">
                <AuditPanel entityType="payment" entityId={receiptDetail.payment.id} title="Payment Audit" />
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-heading">
              <h3>Payment History</h3>
              <button type="button" onClick={exportPayments}>
                <Download size={16} />
                Export
              </button>
            </div>
            <div className="table-toolbar">
              <label>
                Channel
                <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                  <option value="">All channels</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="mpesa_paybill">M-Pesa/paybill</option>
                  <option value="manual_adjustment">Manual adjustment</option>
                </select>
              </label>
              <label>
                From
                <input value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} type="date" />
              </label>
              <label>
                To
                <input value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} type="date" />
              </label>
            </div>
            <TableControls table={paymentTable} label="payments" placeholder="Search payments" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Receipt</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Channel</th>
                    <th>Reference</th>
                    <th>Allocations</th>
                    <th>Credit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTable.visibleRows.length ? (
                    paymentTable.visibleRows.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <strong>{payment.customer_name}</strong>
                          <small>{payment.acc_number}</small>
                        </td>
                        <td>{payment.receipt_number || "-"}</td>
                        <td>{money(payment.amount)}</td>
                        <td>{payment.payment_date?.slice(0, 10)}</td>
                        <td>{payment.payment_channel || payment.method}</td>
                        <td>{payment.external_reference || payment.reference || "-"}</td>
                        <td>
                          {Number(payment.allocation_count || 0).toLocaleString()}
                          <small>{payment.bill_numbers || ""}</small>
                        </td>
                        <td>{money(payment.unallocated_amount)}</td>
                        <td>
                          <span className={`status ${payment.status === "posted" ? "status-valid" : "status-rejected"}`}>
                            {label(payment.status)}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" onClick={() => openReceipt(payment)} disabled={loadingReceipt}>
                              Print
                            </button>
                            {payment.status === "posted" ? (
                              <>
                                <button type="button" onClick={() => edit(payment)}>Edit</button>
                                <button type="button" onClick={() => voidPayment(payment)}>Void</button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={10} title="No payments found" detail="Record payments or adjust the filters." />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h3>Suspense Register</h3>
            </div>
            <TableControls table={suspenseTable} label="suspense items" placeholder="Search suspense" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Resolution</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suspenseTable.visibleRows.length ? (
                    suspenseTable.visibleRows.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.receipt_number || `Suspense ${item.id}`}
                          <small>Payment #{item.source_payment_id}</small>
                        </td>
                        <td>
                          {item.customer_name || "-"}
                          <small>{item.acc_number || ""}</small>
                        </td>
                        <td>{money(item.amount)}</td>
                        <td>{date(item.payment_date)}</td>
                        <td>{item.external_reference || "-"}</td>
                        <td>{item.reason}</td>
                        <td>
                          <span className={`status status-${item.status}`}>{label(item.status)}</span>
                        </td>
                        <td>
                          {item.status === "reapplied" ? item.reapplied_receipt_number || `Payment ${item.reapplied_payment_id}` : null}
                          {item.status === "discarded" ? item.discard_reason || "Discarded" : null}
                          {item.status === "held" ? "Awaiting action" : null}
                        </td>
                        <td>
                          {item.status === "held" ? (
                            <div className="row-actions">
                              <button type="button" onClick={() => reapplySuspense(item)}>
                                Reapply
                              </button>
                              {user.role === "admin" ? (
                                <button type="button" onClick={() => discardSuspense(item)}>
                                  Discard
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={9} title="No suspense items found" detail="Voided payments awaiting action will appear here." />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h3>Adjustment Approvals</h3>
            </div>
            <TableControls table={adjustmentTable} label="adjustments" placeholder="Search adjustments" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Requested</th>
                    {user.role === "admin" ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {adjustmentTable.visibleRows.map((adjustment) => (
                    <tr key={adjustment.id}>
                      <td>
                        <strong>{adjustment.customer_name}</strong>
                        <small>{adjustment.acc_number}</small>
                      </td>
                      <td>{label(adjustment.adjustment_type)}</td>
                      <td>{money(adjustment.amount)}</td>
                      <td>{date(adjustment.adjustment_date)}</td>
                      <td>{adjustment.reason}</td>
                      <td>
                        <span className={`status status-${adjustment.status}`}>{adjustment.status}</span>
                        {adjustment.review_notes ? <small>{adjustment.review_notes}</small> : null}
                      </td>
                      <td>{adjustment.requested_by_name || "-"}</td>
                      {user.role === "admin" ? (
                        <td>
                          {adjustment.status === "pending" ? (
                            <div className="row-actions">
                              <button type="button" onClick={() => reviewAdjustment(adjustment, "approved")}>
                                Approve
                              </button>
                              <button type="button" onClick={() => reviewAdjustment(adjustment, "rejected")}>
                                Reject
                              </button>
                            </div>
                          ) : (
                            adjustment.reviewed_by_name || "-"
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!adjustmentTable.visibleRows.length ? (
                    <EmptyTableRow
                      colSpan={user.role === "admin" ? 8 : 7}
                      title="No adjustment requests found"
                      detail="Manual credits and debits awaiting review will appear here."
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

export default PaymentsPage;
