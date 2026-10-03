import { ArrowLeft, CircleDollarSign, Download, History } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import EntryPanel from "../components/EntryPanel";
import FocusNotice from "../components/FocusNotice";
import MpesaCallbackControl from "../components/MpesaCallbackControl";
import PaymentAdjustmentApprovalPanel from "../components/PaymentAdjustmentApprovalPanel";
import PaymentAdjustmentForm from "../components/PaymentAdjustmentForm";
import PaymentCorrectionTimeline from "../components/PaymentCorrectionTimeline";
import PaymentCsvImportPanel from "../components/PaymentCsvImportPanel";
import PaymentEntryFlow from "../components/PaymentEntryFlow";
import PaymentImportHistoryPanel from "../components/PaymentImportHistoryPanel";
import PaymentImportPreview from "../components/PaymentImportPreview";
import PaymentHistoryPanel from "../components/PaymentHistoryPanel";
import PaymentReceiptPanel from "../components/PaymentReceiptPanel";
import PaymentReconciliationWorkspace from "../components/PaymentReconciliationWorkspace";
import PaymentReviewDialogs from "../components/PaymentReviewDialogs";
import PaymentSuspensePanel from "../components/PaymentSuspensePanel";
import { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import {
  detectStatementMapping,
  findCustomerCandidates,
  normalizeStatementAmount,
  normalizeStatementDate,
  parseStatementCsv,
  readMappedStatementValue,
  statementConfidenceLabel,
  statementRowStatus
} from "../utils/bankReconciliation";
import { extractPdfStatementTable, pdfReadErrorMessage } from "../utils/bankStatementPdf";
import { downloadCsvRows, downloadCsvTemplate, rowsToCsv } from "../utils/csvTemplate";
import { namedExport, withPrintTitle } from "../utils/exportNames";
import useScopedDraft from "../utils/useScopedDraft";
import usePaymentHistory from "../hooks/usePaymentHistory";
import usePaymentsWorkspaceData from "../hooks/usePaymentsWorkspaceData";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => value?.slice(0, 10) || "-";
const todayLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const localDateOffset = (days) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const weekStartLocal = () => {
  const value = new Date();
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const newPaymentSubmissionKey = () =>
  window.crypto?.randomUUID?.() || `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const label = (value) => String(value || "-").replaceAll("_", " ");
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
const paymentImportHeaders = [
  "acc_number",
  "payment_date",
  "amount",
  "payment_channel",
  "transaction_status",
  "receipt_number",
  "external_reference",
  "received_from",
  "bill_number",
  "notes"
];
const bankHistoryStorageKey = "agua-bank-statement-history-v1";

const loadStoredBankHistory = () => {
  try {
    return JSON.parse(window.localStorage.getItem(bankHistoryStorageKey) || "[]");
  } catch {
    return [];
  }
};

const createBankReconciliationDraft = () => ({
  csvText: "",
  headers: [],
  rows: [],
  mapping: {},
  reviewRows: [],
  profileName: "Default",
  importHistory: loadStoredBankHistory(),
  reconciliationExclusions: [],
  stage: 1,
  sourceName: "",
  paymentChannel: "bank"
});
const createPaymentHistoryFilters = () => ({ channel: "", dateFrom: "", dateTo: "" });
const createMpesaCallbackFilters = () => ({ status: "", limit: "20" });

function PaymentsPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [csvText, setCsvText] = useState("acc_number,payment_date,amount,payment_channel,transaction_status,receipt_number,external_reference,received_from,notes\n");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [bankDraft, setBankDraft, clearBankDraft] = useScopedDraft(
    user,
    "payment-bank-reconciliation",
    createBankReconciliationDraft
  );
  const [bankProfileSaving, setBankProfileSaving] = useState(false);
  const [mpesaCallbackFilters, setMpesaCallbackFilters] = useScopedDraft(
    user,
    "mpesa-callback-filters",
    createMpesaCallbackFilters,
    { storage: "local" }
  );
  const updateBankDraftField = (field, value) => {
    setBankDraft((current) => ({
      ...current,
      [field]: typeof value === "function" ? value(current[field]) : value
    }));
  };
  const bankCsvText = bankDraft.csvText || "";
  const bankHeaders = Array.isArray(bankDraft.headers) ? bankDraft.headers : [];
  const bankRows = Array.isArray(bankDraft.rows) ? bankDraft.rows : [];
  const bankMapping = bankDraft.mapping || {};
  const bankReviewRows = Array.isArray(bankDraft.reviewRows) ? bankDraft.reviewRows : [];
  const bankProfileName = bankDraft.profileName || "Default";
  const bankImportHistory = Array.isArray(bankDraft.importHistory) ? bankDraft.importHistory : [];
  const bankStage = Math.min(Math.max(Number(bankDraft.stage) || 1, 1), 4);
  const bankSourceName = bankDraft.sourceName || "";
  const bankPaymentChannel = bankDraft.paymentChannel === "mpesa_paybill" ? "mpesa_paybill" : "bank";
  const mpesaCallbackStatus = ["posted", "duplicate", "rejected"].includes(mpesaCallbackFilters.status)
    ? mpesaCallbackFilters.status
    : "";
  const mpesaCallbackLimit = [20, 50, 100].includes(Number(mpesaCallbackFilters.limit))
    ? Number(mpesaCallbackFilters.limit)
    : 20;
  const setBankCsvText = (value) => updateBankDraftField("csvText", value);
  const setBankHeaders = (value) => updateBankDraftField("headers", value);
  const setBankRows = (value) => updateBankDraftField("rows", value);
  const setBankMapping = (value) => updateBankDraftField("mapping", value);
  const setBankReviewRows = (value) => updateBankDraftField("reviewRows", value);
  const setBankProfileName = (value) => updateBankDraftField("profileName", value);
  const setBankImportHistory = (value) => updateBankDraftField("importHistory", value);
  const setBankStage = (value) => updateBankDraftField("stage", value);
  const setBankSourceName = (value) => updateBankDraftField("sourceName", value);
  const setBankPaymentChannel = (value) => updateBankDraftField("paymentChannel", value);
  const [bankPdfFile, setBankPdfFile] = useState(null);
  const [bankPdfPassword, setBankPdfPassword] = useState("");
  const [bankPdfNeedsPassword, setBankPdfNeedsPassword] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    payment_date: todayLocal(),
    payment_channel: "cash",
    receipt_number: "",
    external_reference: "",
    received_from: "",
    notes: "",
    correction_reason: "",
    cross_account_allocations: []
  });
  const [editingId, setEditingId] = useState(null);
  const [paymentEntryOpen, setPaymentEntryOpen] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentSubmissionReview, setPaymentSubmissionReview] = useState(null);
  const paymentSubmissionRef = useRef(false);
  const paymentIdempotencyRef = useRef("");
  const paymentEntryRef = useRef(null);
  const receiptRef = useRef(null);
  const [paymentHistoryFilters, setPaymentHistoryFilters] = useScopedDraft(
    user,
    "payment-history-filters",
    createPaymentHistoryFilters,
    { storage: "local" }
  );
  const channelFilter = paymentHistoryFilters.channel || "";
  const dateFromFilter = paymentHistoryFilters.dateFrom || "";
  const dateToFilter = paymentHistoryFilters.dateTo || "";
  const [historyQuickView, setHistoryQuickView] = useState(() =>
    channelFilter || dateFromFilter || dateToFilter ? "custom" : "all"
  );
  const [adjustmentForm, setAdjustmentForm] = useState({
    customer_id: "",
    adjustment_type: "credit",
    amount: "",
    adjustment_date: todayLocal(),
    reason: ""
  });
  const [adjustmentReview, setAdjustmentReview] = useState(null);
  const [adjustmentReviewBusy, setAdjustmentReviewBusy] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reapplyCustomerId, setReapplyCustomerId] = useState("");
  const reviewSubmissionRef = useRef(false);
  const [, setMessage] = useToastMessage();
  const {
    adjustments,
    bankMappingProfiles,
    businessSettings,
    correctionsLoading,
    customers,
    initialError,
    initialLoading,
    load,
    mpesaCallbackEvents,
    mpesaIntegration,
    paymentCorrections,
    paymentImportBatches,
    payments,
    refreshMpesaCallbackEvents,
    setBankMappingProfiles,
    standingOrders,
    suspenseItems
  } = usePaymentsWorkspaceData({ mpesaCallbackFilters });
  const bankProfiles = bankMappingProfiles[bankPaymentChannel] || {};
  const recentCustomerIds = useMemo(
    () => [...new Set(payments.map((payment) => Number(payment.customer_id)).filter(Boolean))].slice(0, 6),
    [payments]
  );
  const importReady = useMemo(
    () => importPreview?.rows?.length > 0 && importPreview.summary.invalid === 0,
    [importPreview]
  );
  const receiptMoney = (value) =>
    `${businessSettings?.default_currency || "KES"} ${Number(value || 0).toLocaleString()}`;
  const receiptPositionMoney = (value) =>
    `${businessSettings?.default_currency || "KES"} ${Math.abs(Number(value || 0)).toLocaleString()}`;

  const updateMpesaCallbackFilters = (field, value) => {
    const nextFilters = { ...mpesaCallbackFilters, [field]: value };
    setMpesaCallbackFilters(nextFilters);
    refreshMpesaCallbackEvents(nextFilters).catch((err) => setMessage(err.message));
  };

  useEffect(() => {
    if (navigationIntent?.page !== "payments" || navigationIntent.focus !== "prepare_payment" || !navigationIntent.customer_id) return;
    const customer = customers.find((row) => Number(row.id) === Number(navigationIntent.customer_id));
    if (!customer) return;
    setEditingId(null);
    setPaymentEntryOpen(true);
    setForm((current) => ({ ...current, customer_id: String(customer.id), amount: "", correction_reason: "" }));
    paymentEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [customers, navigationIntent]);

  const setField = (field, value) => {
    if (!paymentSubmitting) paymentIdempotencyRef.current = "";
    setForm((current) => ({ ...current, [field]: value }));
  };
  const setAdjustmentField = (field, value) => setAdjustmentForm((current) => ({ ...current, [field]: value }));

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const loadBankStatement = (text) => {
    setMessage("");
    const parsed = parseStatementCsv(text);
    if (!parsed.headers.length) {
      setBankHeaders([]);
      setBankRows([]);
      setBankReviewRows([]);
      setMessage("No bank statement rows were found in the CSV.");
      return;
    }

    const detectedMapping = detectStatementMapping(parsed.headers);
    setBankHeaders(parsed.headers);
    setBankRows(parsed.rows);
    setBankReviewRows([]);
    setBankStage(2);
    setBankMapping((current) =>
      parsed.headers.reduce(
        (next, header) => ({
          ...next,
          [header]: current[header] ?? detectedMapping[header] ?? ""
        }),
        {}
      )
    );
    setMessage(`Loaded ${parsed.rows.length} statement row(s). Map the columns, then generate payment rows.`);
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
      setBankMapping(bankProfiles[bankProfileName] || detectStatementMapping(extracted.table.headers));
      setBankStage(2);
      setMessage(`Extracted ${extracted.table.rows.length} payment row(s) from the PDF. The content box is now CSV-like; map the columns, then generate payment rows.`);
    } catch (err) {
      const needsPassword = err?.name === "PasswordException" || /password/i.test(err?.message || "");
      setBankPdfNeedsPassword(needsPassword);
      setMessage(pdfReadErrorMessage(err, Boolean(bankPdfPassword)));
    }
  };

  const handleBankCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBankSourceName(file.name);
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
    setBankStage(2);
  };

  const applyBankProfile = (name) => {
    setBankProfileName(name);
    if (bankProfiles[name]) {
      setBankMapping(bankProfiles[name]);
      setBankReviewRows([]);
      setMessage(`Loaded ${name} bank mapping profile.`);
    }
  };

  const saveBankTemplate = async () => {
    const name = bankProfileName.trim() || "Default";
    setBankProfileSaving(true);
    try {
      const profile = await api.payments.saveImportMappingProfile({
        name,
        payment_channel: bankPaymentChannel,
        mapping: bankMapping
      });
      setBankMappingProfiles((current) => ({
        ...current,
        [bankPaymentChannel]: {
          ...(current[bankPaymentChannel] || {}),
          [profile.name]: profile.mapping || {}
        }
      }));
      setBankProfileName(profile.name);
      setMessage(`${profile.name} mapping saved for the finance team.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBankProfileSaving(false);
    }
  };

  const resetBankReconciliation = () => {
    clearBankDraft();
    setBankPdfFile(null);
    setBankPdfPassword("");
    setBankPdfNeedsPassword(false);
    if (bankStage === 4) {
      setCsvText("acc_number,payment_date,amount,payment_channel,transaction_status,receipt_number,external_reference,received_from,notes\n");
      setImportPreview(null);
    }
    setMessage("Bank reconciliation cleared.");
  };

  const makeBankReviewRow = (paymentRow, id, sourceRowNumber) => {
    const normalizedPaymentRow = {
      ...paymentRow,
      payment_date: normalizeStatementDate(paymentRow.payment_date),
      amount: normalizeStatementAmount(paymentRow.amount),
      payment_channel: bankPaymentChannel,
      bill_number: ""
    };
    const candidates = findCustomerCandidates(normalizedPaymentRow, customers, standingOrders);
    const directCustomer = paymentRow.acc_number
      ? customers.find((customer) => customer.acc_number === paymentRow.acc_number)
      : null;
    const selectedCandidate =
      candidates[0]?.score >= 85 &&
      (!candidates[1] || candidates[0].score - candidates[1].score >= 15)
        ? candidates[0]
        : null;
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
      ignore_reason: "",
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
        payment_date: readMappedStatementValue(row, bankMapping, "payment_date"),
        amount: readMappedStatementValue(row, bankMapping, "amount"),
        acc_number: readMappedStatementValue(row, bankMapping, "acc_number"),
        receipt_number: readMappedStatementValue(row, bankMapping, "receipt_number"),
        external_reference: readMappedStatementValue(row, bankMapping, "external_reference"),
        transaction_status: readMappedStatementValue(row, bankMapping, "transaction_status"),
        received_from: readMappedStatementValue(row, bankMapping, "received_from"),
        narration: readMappedStatementValue(row, bankMapping, "narration"),
        notes: readMappedStatementValue(row, bankMapping, "notes")
      }, `${row._rowNumber}-${index}`, row._rowNumber);
    });

    setBankReviewRows(reviewRows);
    setBankStage(3);
    const readyRows = reviewRows.filter((row) => statementRowStatus(row) === "ready");
    setMessage(
      `${readyRows.length} of ${reviewRows.length} ${bankPaymentChannel === "mpesa_paybill" ? "M-Pesa" : "bank"} row(s) are ready. Review unmatched or unverified rows before importing.`
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
              customer_name: customer?.name || "",
              candidate_score: customer ? 100 : 0,
              candidate_reason: customer ? "manual account" : ""
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
          const candidates = findCustomerCandidates(nextRow, customers, standingOrders);
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

  const ignoreUnresolvedBankRows = (reason) => {
    const ignoredCount = bankReviewRows.filter((row) => {
      const status = statementRowStatus(row);
      return status !== "ready" && status !== "ignored";
    }).length;
    if (!ignoredCount) return;
    const ignoreReason = String(reason || "").trim();
    if (ignoreReason.length < 3) {
      setMessage("Enter a clear reason before excluding unresolved statement rows.");
      return;
    }
    setBankReviewRows((current) =>
      current.map((row) => {
        const status = statementRowStatus(row);
        return status !== "ready" && status !== "ignored"
          ? { ...row, ignored: true, ignore_reason: ignoreReason }
          : row;
      })
    );
    setMessage(`${ignoredCount} unresolved statement row(s) excluded with a recorded reason. They remain in the saved draft and can be restored before validation.`);
  };

  const restoreIgnoredBankRows = () => {
    const restoredCount = bankReviewRows.filter((row) => row.ignored).length;
    if (!restoredCount) return;
    setBankReviewRows((current) => current.map((row) => (row.ignored ? { ...row, ignored: false, ignore_reason: "" } : row)));
    setMessage(`${restoredCount} statement row(s) restored for matching and review.`);
  };

  const useBankPaymentRows = () => {
    const readyRows = bankReviewRows.filter((row) => statementRowStatus(row) === "ready");
    const ignoredRows = bankReviewRows.filter((row) => row.ignored);
    const missingIgnoreReason = ignoredRows.find((row) => String(row.ignore_reason || "").trim().length < 3);
    if (missingIgnoreReason) {
      setMessage(`Enter an exclusion reason for statement row ${missingIgnoreReason.source_row_number} before validation.`);
      return;
    }
    if (!readyRows.length) {
      setMessage("No ready payment rows were found. Match accounts and check the date, amount, reference, and M-Pesa status first.");
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
      source: bankSourceName || bankPdfFile?.name || "Pasted statement / CSV",
      profile: bankProfileName.trim() || "Default",
      rows: readyRows.length,
      ignored: ignoredRows.length,
      ignored_total: ignoredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      total: readyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    };
    const nextHistory = [historyItem, ...bankImportHistory].slice(0, 10);
    setBankImportHistory(nextHistory);
    window.localStorage.setItem(bankHistoryStorageKey, JSON.stringify(nextHistory));
    updateBankDraftField(
      "reconciliationExclusions",
      ignoredRows.map((row) => ({
        source_row_number: row.source_row_number,
        external_reference: row.external_reference || "",
        amount: Number(row.amount || 0),
        reason: String(row.ignore_reason || "").trim()
      }))
    );
    setBankStage(4);
    setMessage(`${readyRows.length} payment row(s) are ready for final validation.`);
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

  const importSourceName = () =>
    bankStage === 4
      ? bankSourceName || (bankPaymentChannel === "mpesa_paybill" ? "M-Pesa paybill statement" : "Bank statement")
      : "CSV payment import";

  const requestImportCommit = () => {
    if (!importReady || importing) return;
    setImportReviewOpen(true);
  };

  const commitImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const reconciliationExclusions = Array.isArray(bankDraft.reconciliationExclusions)
        ? bankDraft.reconciliationExclusions
        : [];
      const result = await api.payments.commitImport(csvText, importSourceName(), reconciliationExclusions);
      setImportPreview(null);
      await load();
      if (bankStage === 4) {
        clearBankDraft();
        setBankPdfFile(null);
        setBankPdfPassword("");
        setBankPdfNeedsPassword(false);
      }
      setImportReviewOpen(false);
      setMessage(
        `Imported ${result.summary.imported} payment(s), total ${money(result.summary.totalAmount)}. Batch ${result.batch?.batch_reference || "recorded"}.`
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const requestPaymentSubmission = (event) => {
    event.preventDefault();
    if (paymentSubmissionRef.current || paymentSubmitting) return;
    const customer = customers.find((row) => Number(row.id) === Number(form.customer_id));
    const amount = Number(form.amount);
    if (!customer || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Select a valid customer and payment amount before reviewing the receipt.");
      return;
    }
    const balanceDue = Number(customer.balance_due || 0);
    const crossAccountAllocations = Array.isArray(form.cross_account_allocations) ? form.cross_account_allocations : [];
    const splitTotal = crossAccountAllocations.reduce((sum, allocation) => sum + Number(allocation?.amount || 0), 0);
    const primaryAmount = Math.max(amount - splitTotal, 0);
    const amountToBalance = Math.min(primaryAmount, Math.max(balanceDue, 0));
    if (
      crossAccountAllocations.some(
        (allocation) => !allocation?.customer_id || !Number.isFinite(Number(allocation?.amount)) || Number(allocation.amount) <= 0
      ) ||
      splitTotal - amount > 0.005
    ) {
      setMessage("Complete each split account and amount without exceeding the receipt amount.");
      return;
    }
    const allocationPlan = crossAccountAllocations.length
      ? [
          ...(amount - splitTotal > 0.005 ? [{ customer_id: Number(customer.id), amount: Math.round((amount - splitTotal) * 100) / 100 }] : []),
          ...crossAccountAllocations.map((allocation) => ({
            customer_id: Number(allocation.customer_id),
            amount: Math.round(Number(allocation.amount) * 100) / 100
          }))
        ]
      : [];
    const allocationAccounts = allocationPlan.map((allocation) => {
      const target = customers.find((row) => Number(row.id) === allocation.customer_id);
      return { ...allocation, acc_number: target?.acc_number || "Account", name: target?.name || "" };
    });
    setPaymentSubmissionReview({
      editingId,
      form: { ...form },
      customer: { id: customer.id, name: customer.name, acc_number: customer.acc_number },
      amount,
      balanceDue,
      amountToBalance,
      amountToCredit: Math.max(primaryAmount - amountToBalance, 0),
      allocationPlan,
      allocationAccounts
    });
  };

  const submitPayment = async () => {
    if (!paymentSubmissionReview || paymentSubmissionRef.current) return;
    const submission = paymentSubmissionReview;
    const submissionForm = submission.form;
    paymentSubmissionRef.current = true;
    setPaymentSubmitting(true);
    setMessage("");

    try {
      let successMessage = submission.editingId ? "Payment updated." : "Payment recorded.";
      let createdPaymentId = null;
      if (submission.editingId) {
        await api.payments.update(submission.editingId, {
          amount: Number(submissionForm.amount),
          payment_date: submissionForm.payment_date,
          payment_channel: submissionForm.payment_channel,
          receipt_number: submissionForm.receipt_number,
          external_reference: submissionForm.external_reference,
          received_from: submissionForm.received_from,
          notes: submissionForm.notes,
          correction_reason: submissionForm.correction_reason
        });
      } else {
        const idempotencyKey = paymentIdempotencyRef.current || newPaymentSubmissionKey();
        paymentIdempotencyRef.current = idempotencyKey;
        const { correction_reason: _correctionReason, cross_account_allocations: _crossAccountAllocations, ...creationForm } = submissionForm;
        const result = await api.payments.create({
          ...creationForm,
          customer_id: Number(submissionForm.customer_id),
          amount: Number(submissionForm.amount),
          allocation_plan: submission.allocationPlan,
          idempotency_key: idempotencyKey
        });
        createdPaymentId = result.payment?.id || null;
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
        notes: "",
        correction_reason: "",
        cross_account_allocations: []
      }));
      setEditingId(null);
      setPaymentEntryOpen(false);
      setPaymentSubmissionReview(null);
      paymentIdempotencyRef.current = "";
      await load();
      if (createdPaymentId) {
        const nextReceipt = await api.payments.get(createdPaymentId).catch(() => null);
        if (nextReceipt) {
          setReceiptDetail(nextReceipt);
          window.requestAnimationFrame(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      }
      setMessage(successMessage);
    } catch (err) {
      setMessage(err.message);
    } finally {
      paymentSubmissionRef.current = false;
      setPaymentSubmitting(false);
    }
  };

  const edit = (payment) => {
    setPaymentSubmissionReview(null);
    setEditingId(payment.id);
    setPaymentEntryOpen(true);
    setForm({
      customer_id: payment.customer_id || "",
      amount: payment.amount || "",
      payment_date: payment.payment_date?.slice(0, 10) || todayLocal(),
      payment_channel: payment.payment_channel || payment.method || "cash",
      receipt_number: payment.receipt_number || "",
      external_reference: payment.external_reference || payment.reference || "",
      received_from: payment.received_from || "",
      notes: payment.notes || "",
      correction_reason: "",
      cross_account_allocations: []
    });
    window.requestAnimationFrame(() => paymentEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const openReceipt = async (paymentOrId) => {
    const paymentId = typeof paymentOrId === "object" ? paymentOrId?.id : paymentOrId;
    if (!paymentId) return;
    setMessage("");
    setLoadingReceipt(true);
    try {
      setReceiptDetail(await api.payments.get(paymentId));
      window.requestAnimationFrame(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoadingReceipt(false);
    }
  };

  useEffect(() => {
    if (navigationIntent?.page !== "payments" || navigationIntent.focus !== "receipt_detail" || !navigationIntent.payment_id) return;
    if (Number(receiptDetail?.payment?.id) === Number(navigationIntent.payment_id)) return;
    openReceipt(navigationIntent.payment_id);
  }, [navigationIntent, receiptDetail]);

  const printReceipt = () => {
    const receipt = receiptDetail?.payment || {};
    setTimeout(
      () =>
        withPrintTitle(
          `receipt ${receipt.receipt_number || receipt.id || "payment"} ${receipt.acc_number || receipt.customer_name || ""}`,
          () => window.print(),
          businessSettings
        ),
      50
    );
  };

  const sendReceiptEmail = async (id) => {
    setMessage("");
    try {
      const result = await api.payments.sendReceiptEmail(id);
      setMessage(result.message || "Receipt email request completed.");
      if (receiptDetail?.payment?.id === id) {
        setReceiptDetail(await api.payments.get(id));
      }
    } catch (err) {
      setMessage(err.message);
    }
  };
  const sendReceiptSms = async (id) => {
    setMessage("");
    try {
      const result = await api.payments.sendReceiptSms(id);
      setMessage(result.message || "Receipt SMS request completed.");
      if (receiptDetail?.payment?.id === id) {
        setReceiptDetail(await api.payments.get(id));
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPaymentSubmissionReview(null);
    paymentIdempotencyRef.current = "";
    setForm({
      customer_id: "",
      amount: "",
      payment_date: todayLocal(),
      payment_channel: "cash",
      receipt_number: "",
      external_reference: "",
      received_from: "",
      notes: "",
      correction_reason: ""
    });
  };

  const recordAnotherPayment = () => {
    setReceiptDetail(null);
    setPaymentEntryOpen(true);
    window.requestAnimationFrame(() => paymentEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
        adjustment_date: todayLocal(),
        reason: ""
      });
      await load();
      setMessage("Adjustment request submitted for admin approval.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const requestAdjustmentReview = (adjustment, status) => {
    setMessage("");
    setAdjustmentReview({ adjustment, status });
  };

  const submitAdjustmentReview = async (reviewNotes) => {
    if (!adjustmentReview || adjustmentReviewBusy) return;
    const { adjustment, status } = adjustmentReview;
    setAdjustmentReviewBusy(true);
    setMessage("");
    try {
      await api.adjustments.review(adjustment.id, {
        status,
        review_notes: reviewNotes
      });
      await load();
      setAdjustmentReview(null);
      setMessage(`Adjustment ${status}.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setAdjustmentReviewBusy(false);
    }
  };

  const closeReviewDialog = useCallback(() => {
    if (reviewSubmissionRef.current) return;
    setReviewAction(null);
    setReviewError("");
    setReapplyCustomerId("");
  }, []);

  const voidPayment = (payment) => {
    setReviewError("");
    setReviewAction({ type: "void", item: payment });
  };

  const reapplySuspense = (item) => {
    const originalCustomer = customers.find((row) => Number(row.id) === Number(item.customer_id))
      || customers.find((row) => row.acc_number?.toLowerCase() === item.acc_number?.toLowerCase());
    setReapplyCustomerId(originalCustomer ? String(originalCustomer.id) : "");
    setReviewError("");
    setReviewAction({ type: "reapply", item });
  };

  const discardSuspense = (item) => {
    setReviewError("");
    setReviewAction({ type: "discard", item });
  };

  const submitReviewAction = async (reasonOrNotes) => {
    if (!reviewAction || reviewSubmissionRef.current) return;

    const { type, item } = reviewAction;
    const selectedReapplyCustomer = type === "reapply"
      ? customers.find((row) => Number(row.id) === Number(reapplyCustomerId))
      : null;

    if (type === "reapply" && !selectedReapplyCustomer) {
      setReviewError("Select a valid customer account before reapplying this suspense item.");
      return;
    }

    reviewSubmissionRef.current = true;
    setReviewBusy(true);
    setReviewError("");
    setMessage("");
    try {
      if (type === "void") {
        await api.payments.voidToSuspense(item.id, { reason: reasonOrNotes });
      } else if (type === "reapply") {
        await api.payments.reapplySuspense(item.id, {
          customer_id: selectedReapplyCustomer.id,
          payment_date: item.payment_date?.slice(0, 10),
          payment_channel: item.payment_channel || "bank",
          external_reference: item.external_reference,
          received_from: item.received_from,
          notes: reasonOrNotes
        });
      } else {
        await api.payments.discardSuspense(item.id, { reason: reasonOrNotes });
      }

      await load();
      if (type === "void") {
        setReceiptDetail(null);
        setMessage("Payment voided and moved to suspense.");
      } else if (type === "reapply") {
        setMessage("Suspense item reapplied as a new payment.");
      } else {
        setMessage("Suspense item discarded.");
      }
      setReviewAction(null);
      setReapplyCustomerId("");
    } catch (err) {
      setReviewError(err.message);
      setMessage(err.message);
    } finally {
      reviewSubmissionRef.current = false;
      setReviewBusy(false);
    }
  };

  const focusKey = navigationIntent?.page === "payments" ? navigationIntent.focus : "";
  const returnTarget = navigationIntent?.page === "payments" ? navigationIntent.return_target : null;
  const focusedSuspenseItems = focusKey === "suspense_payments"
    ? suspenseItems.filter((item) => item.status === "held")
    : suspenseItems;
  const focusedAdjustments = focusKey === "pending_adjustments"
    ? adjustments.filter((adjustment) => adjustment.status === "pending")
    : adjustments;
  const hasPaymentFocus = ["suspense_payments", "customer_credits", "pending_adjustments"].includes(focusKey);
  const showEntryTools = !hasPaymentFocus || focusKey === "pending_adjustments";
  const showPaymentEntry = !hasPaymentFocus;
  const showAdjustmentEntry = !hasPaymentFocus || focusKey === "pending_adjustments";
  const showBankTools = !hasPaymentFocus;
  const showPaymentHistory = !hasPaymentFocus || focusKey === "customer_credits";
  const showSuspenseRegister = !hasPaymentFocus || focusKey === "suspense_payments";
  const showAdjustmentRegister = !hasPaymentFocus || focusKey === "pending_adjustments";
  const { creditTotal: paymentCreditTotal, historyTotal: paymentHistoryTotal, requestParams: paymentRegisterParams, table: paymentTable } = usePaymentHistory({
    filters: { channel: channelFilter, dateFrom: dateFromFilter, dateTo: dateToFilter },
    focusKey,
    refreshKey: payments
  });
  const adjustmentTable = useTableControls(focusedAdjustments, {
    storageKey: `payments-adjustments:${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`,
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
  const suspenseTable = useTableControls(focusedSuspenseItems, {
    storageKey: `payments-suspense:${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`,
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
  if (initialLoading) {
    return <WorkspaceState title="Preparing cash office controls" detail="Retrieving receipts, customer balances, suspense items, adjustments, and reconciliation status." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Cash office controls could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }
  const suspenseHeldTotal = focusedSuspenseItems
    .filter((item) => item.status === "held")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingAdjustmentTotal = focusedAdjustments
    .filter((adjustment) => adjustment.status === "pending")
    .reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);
  const exportPayments = async () => {
    try {
      const rows = await api.payments.registerAll(paymentRegisterParams);
      downloadCsvRows(
        namedExport("payment-register", "csv", [
          channelFilter || "all-channels",
          dateFromFilter || "start",
          dateToFilter || "end",
          focusKey || "all-payments"
        ]),
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
        rows
      );
    } catch (error) {
      setMessage(error.message || "Payment history export could not be prepared.");
    }
  };

  const applyPaymentHistoryView = (view) => {
    const today = todayLocal();
    setHistoryQuickView(view);
    if (view === "today") {
      setPaymentHistoryFilters({ channel: "", dateFrom: today, dateTo: today });
      return;
    }
    if (view === "yesterday") {
      const yesterday = localDateOffset(-1);
      setPaymentHistoryFilters({ channel: "", dateFrom: yesterday, dateTo: yesterday });
      return;
    }
    if (view === "week_to_date") {
      setPaymentHistoryFilters({ channel: "", dateFrom: weekStartLocal(), dateTo: today });
      return;
    }
    if (view === "bank_today" || view === "mpesa_today") {
      setPaymentHistoryFilters({
        channel: view === "bank_today" ? "bank" : "mpesa_paybill",
        dateFrom: today,
        dateTo: today
      });
      return;
    }
    setPaymentHistoryFilters(createPaymentHistoryFilters());
  };

  const setManualPaymentHistoryFilter = (field) => (value) => {
    setHistoryQuickView("custom");
    setPaymentHistoryFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="page-stack payment-workbench">
      <header className="page-header payment-workbench-header">
        <div>
          <p className="eyebrow">Cash Office</p>
          <h2>Post cash with confidence.</h2>
          <p>Find the account, confirm the allocation, then issue the receipt without losing sight of exceptions.</p>
        </div>
        <div className="payment-workbench-total">
          <small>Recorded in this view</small>
          <strong>{money(paymentHistoryTotal)}</strong>
          <span>{paymentTable.total.toLocaleString()} receipt(s)</span>
        </div>
      </header>

      <section className="payment-workbench-metrics" aria-label="Payment control snapshot">
        <div><small>Receipts</small><strong>{paymentTable.total.toLocaleString()}</strong><span>Current filter</span></div>
        <div><small>Received</small><strong>{money(paymentHistoryTotal)}</strong><span>Posted payment value</span></div>
        <div><small>Customer credit</small><strong>{money(paymentCreditTotal)}</strong><span>Awaiting allocation</span></div>
        <div><small>Suspense held</small><strong>{money(suspenseHeldTotal)}</strong><span>Needs review</span></div>
      </section>

      {!hasPaymentFocus ? (
        <MpesaCallbackControl
          events={mpesaCallbackEvents}
          filters={{ status: mpesaCallbackStatus, limit: String(mpesaCallbackLimit) }}
          integration={mpesaIntegration}
          money={money}
          onFiltersChange={updateMpesaCallbackFilters}
          onRefresh={() => refreshMpesaCallbackEvents().catch((err) => setMessage(err.message))}
        />
      ) : null}

      {focusKey === "suspense_payments" ? (
        <FocusNotice
          title="Suspense payments"
          detail="Showing held suspense items awaiting reapplication or discard."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "prepare_payment" ? (
        <FocusNotice
          title="Post payment for selected account"
          detail="The customer is prefilled. Review the allocation and receipt before any payment is recorded."
          actionLabel={returnTarget ? "Return to account" : undefined}
          onAction={returnTarget ? () => onNavigate?.(returnTarget) : undefined}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "customer_credits" ? (
        <FocusNotice
          title="Customer credits"
          detail="Showing posted payments with unallocated credit balances."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "pending_adjustments" ? (
        <FocusNotice
          title="Pending adjustments"
          detail="Showing manual credit/debit requests awaiting review."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="workspace-grid payments-workspace-grid">
        {showEntryTools ? (
        <div className="page-stack payments-entry-grid">
          {showPaymentEntry ? (
          <EntryPanel
            actionLabel="Record payment"
            className="payment-entry-panel"
            disabled={paymentSubmitting || Boolean(paymentSubmissionReview)}
            icon={<CircleDollarSign size={18} />}
            onOpenChange={setPaymentEntryOpen}
            open={paymentEntryOpen}
            summary={editingId ? "Editing a posted receipt" : "Find an account, verify the allocation, then review the receipt"}
            title={editingId ? "Edit payment" : "Post payment"}
          >
            <div className="payment-entry-shell" ref={paymentEntryRef}>
              <PaymentEntryFlow
                form={form}
                customers={customers}
                recentCustomerIds={recentCustomerIds}
                editingId={editingId}
                submitting={paymentSubmitting}
                reviewing={Boolean(paymentSubmissionReview)}
                onFieldChange={setField}
                onSubmit={requestPaymentSubmission}
                onCancelEdit={cancelEdit}
              />
            </div>
          </EntryPanel>
          ) : null}

          {showAdjustmentEntry ? (
          <PaymentAdjustmentForm
            customers={customers}
            defaultOpen={focusKey === "pending_adjustments"}
            form={adjustmentForm}
            money={money}
            onFieldChange={setAdjustmentField}
            onSubmit={submitAdjustment}
            pendingCount={focusedAdjustments.filter((adjustment) => adjustment.status === "pending").length}
            pendingTotal={pendingAdjustmentTotal}
          />
          ) : null}

          {showBankTools ? (
          <>
          <PaymentReconciliationWorkspace
            bankCsvText={bankCsvText}
            bankHeaders={bankHeaders}
            bankImportHistory={bankImportHistory}
            bankMapping={bankMapping}
            bankPaymentChannel={bankPaymentChannel}
            bankPdfFile={bankPdfFile}
            bankPdfNeedsPassword={bankPdfNeedsPassword}
            bankPdfPassword={bankPdfPassword}
            bankProfileName={bankProfileName}
            bankProfileSaving={bankProfileSaving}
            bankProfiles={bankProfiles}
            bankReviewRows={bankReviewRows}
            bankRows={bankRows}
            bankSourceName={bankSourceName}
            bankStage={bankStage}
            customers={customers}
            date={date}
            importing={importing}
            importPreview={importPreview}
            importReady={importReady}
            money={money}
            mpesaIntegration={mpesaIntegration}
            onAccountChange={updateBankReviewAccount}
            onChannelChange={(channel) => {
              setBankPaymentChannel(channel);
              setBankReviewRows([]);
              setImportPreview(null);
            }}
            onCsvChange={(value) => {
              setBankCsvText(value);
              setBankHeaders([]);
              setBankRows([]);
              setBankReviewRows([]);
            }}
            onDetect={() => {
              if (!bankSourceName) setBankSourceName("Pasted statement / CSV");
              loadBankStatement(bankCsvText);
            }}
            onFileChange={handleBankCsvFile}
            onIgnoreUnresolved={ignoreUnresolvedBankRows}
            onMappingChange={updateBankMapping}
            onPdfPasswordChange={setBankPdfPassword}
            onPreview={previewImport}
            onProfileChange={applyBankProfile}
            onProfileNameChange={setBankProfileName}
            onReadPdf={() => loadBankPdfStatement(bankPdfFile)}
            onRequestCommit={requestImportCommit}
            onReset={resetBankReconciliation}
            onReview={generateBankPaymentRows}
            onRowChange={updateBankReviewField}
            onRestoreIgnored={restoreIgnoredBankRows}
            onSaveTemplate={saveBankTemplate}
            onStageChange={setBankStage}
            onUseRows={useBankPaymentRows}
            statementConfidenceLabel={statementConfidenceLabel}
            statementRowStatus={statementRowStatus}
          />

          <PaymentCsvImportPanel
            csvText={csvText}
            defaultOpen={Boolean(importPreview) && bankStage !== 4}
            importing={importing}
            importPreview={importPreview}
            importReady={importReady}
            money={money}
            onCsvChange={(value) => {
              setCsvText(value);
              setImportPreview(null);
            }}
            onFileChange={handleCsvFile}
            onPreview={previewImport}
            onRequestCommit={requestImportCommit}
            onTemplate={() => downloadCsvTemplate("payments-import-template.csv", paymentImportHeaders)}
          />
          </>
          ) : null}
        </div>
        ) : null}

        <div className="page-stack wide-panel">
          {!hasPaymentFocus ? <PaymentImportPreview money={money} preview={importPreview} /> : null}

          <PaymentImportHistoryPanel batches={paymentImportBatches} date={date} label={label} money={money} />

          <PaymentReceiptPanel
            businessSettings={businessSettings}
            date={date}
            label={label}
            onClose={() => setReceiptDetail(null)}
            onEmail={sendReceiptEmail}
            onPrint={printReceipt}
            onRecordAnother={recordAnotherPayment}
            onSms={sendReceiptSms}
            positionLabel={accountPositionLabel}
            positionMoney={receiptPositionMoney}
            receipt={receiptDetail}
            receiptMoney={receiptMoney}
            receiptRef={receiptRef}
          />

          {!hasPaymentFocus ? (
            <CollapsibleSection
              defaultOpen={false}
              icon={<History size={18} />}
              summary={`${paymentCorrections.length.toLocaleString()} recent event(s)`}
              title="Recently Corrected"
            >
              <PaymentCorrectionTimeline
                events={paymentCorrections}
                loading={correctionsLoading}
                onViewReceipt={openReceipt}
              />
            </CollapsibleSection>
          ) : null}

          {showPaymentHistory ? (
            <PaymentHistoryPanel
              channelFilter={channelFilter}
              dateFromFilter={dateFromFilter}
              dateToFilter={dateToFilter}
              defaultOpen={focusKey === "customer_credits"}
              historyTotal={paymentHistoryTotal}
              historyQuickView={historyQuickView}
              label={label}
              loading={paymentTable.loading}
              loadingReceipt={loadingReceipt}
              money={money}
              onChannelFilterChange={setManualPaymentHistoryFilter("channel")}
              onDateFromFilterChange={setManualPaymentHistoryFilter("dateFrom")}
              onDateToFilterChange={setManualPaymentHistoryFilter("dateTo")}
              onEdit={edit}
              onEmail={sendReceiptEmail}
              onExport={exportPayments}
              onOpenReceipt={openReceipt}
              onQuickView={applyPaymentHistoryView}
              onSms={sendReceiptSms}
              onVoid={voidPayment}
              table={paymentTable}
            />
          ) : null}

          {showSuspenseRegister ? (
            <PaymentSuspensePanel
              admin={user.role === "admin"}
              date={date}
              defaultOpen={focusKey === "suspense_payments"}
              heldCount={focusedSuspenseItems.filter((item) => item.status === "held").length}
              heldTotal={suspenseHeldTotal}
              label={label}
              money={money}
              onDiscard={discardSuspense}
              onReapply={reapplySuspense}
              table={suspenseTable}
            />
          ) : null}

          {showAdjustmentRegister ? (
            <PaymentAdjustmentApprovalPanel
              admin={user.role === "admin"}
              date={date}
              defaultOpen={focusKey === "pending_adjustments"}
              label={label}
              money={money}
              onReview={requestAdjustmentReview}
              pendingCount={focusedAdjustments.filter((adjustment) => adjustment.status === "pending").length}
              pendingTotal={pendingAdjustmentTotal}
              table={adjustmentTable}
            />
          ) : null}
        </div>
      </section>
      <PaymentReviewDialogs
        customers={customers}
        importPreview={importPreview}
        importing={importing}
        importReviewOpen={importReviewOpen}
        importSourceName={importSourceName}
        money={money}
        onCloseImportReview={() => !importing && setImportReviewOpen(false)}
        onClosePaymentReview={closeReviewDialog}
        adjustmentReview={adjustmentReview}
        adjustmentReviewBusy={adjustmentReviewBusy}
        onCloseAdjustmentReview={() => !adjustmentReviewBusy && setAdjustmentReview(null)}
        onConfirmAdjustmentReview={submitAdjustmentReview}
        onClosePaymentSubmission={() => !paymentSubmitting && setPaymentSubmissionReview(null)}
        onCommitImport={commitImport}
        onConfirmPaymentSubmission={submitPayment}
        onConfirmPaymentReview={submitReviewAction}
        onReapplyCustomerChange={(value) => {
          setReapplyCustomerId(value);
          setReviewError("");
        }}
        reapplyCustomerId={reapplyCustomerId}
        reviewAction={reviewAction}
        reviewBusy={reviewBusy}
        reviewError={reviewError}
        paymentSubmissionReview={paymentSubmissionReview}
        paymentSubmitting={paymentSubmitting}
      />
    </section>
  );
}

export default PaymentsPage;
