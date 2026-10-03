import { FileText, Printer, ReceiptText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DocumentPrintHeader from "../components/DocumentPrintHeader";
import { EmptyTableRow } from "../components/EmptyState";
import PortalAccountSnapshot from "../components/PortalAccountSnapshot";
import PortalDeliveryPreferencesPanel from "../components/PortalDeliveryPreferencesPanel";
import PortalReadingSubmissionWorkspace from "../components/PortalReadingSubmissionWorkspace";
import PortalServiceRequestWorkspace from "../components/PortalServiceRequestWorkspace";
import PortalStatementWorkspace from "../components/PortalStatementWorkspace";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import { downloadBlobFile, getPrintPageDimensionsMm, namedExport, normalizePrintSettings, withPrintTitle } from "../utils/exportNames";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const moneyAbs = (value) => `KES ${Math.abs(Number(value || 0)).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) => value?.slice(0, 10) || "-";
const todayLocal = () => {
  const current = new Date();
  const timezoneOffset = current.getTimezoneOffset() * 60000;
  return new Date(current.getTime() - timezoneOffset).toISOString().slice(0, 10);
};
const label = (value) => String(value || "-").replaceAll("_", " ");
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
const formatCompact = (value) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toLocaleString();
};
const paddedChartMax = (dataMax) => {
  const max = Number(dataMax || 0);
  if (max <= 0) return 10;
  const headroom = max * 0.15;
  const roundedStep = 10 ** Math.max(0, Math.floor(Math.log10(max)) - 1);
  return Math.ceil((max + headroom) / roundedStep) * roundedStep;
};
const moneyTooltip = (value, name) => [money(value), String(name || "").replaceAll("_", " ")];
const unitsTooltip = (value, name) => [`${number(value)} units`, String(name || "").replaceAll("_", " ")];
const nonZeroChargeRows = (bill) =>
  [
    ["Usage subtotal", bill?.subtotal_amount || bill?.total_amount],
    ["Fixed charge", bill?.fixed_charge_amount],
    ["Penalty", bill?.penalty_amount],
    ["VAT", bill?.vat_amount],
    ["Reconnection fee", bill?.reconnection_fee_amount],
    ["Adjustment", bill?.adjustment_amount]
  ].filter(([title, amount]) => title === "Usage subtotal" || Number(amount || 0) !== 0);

const blankRequest = {
  category: "leak",
  priority: "normal",
  description: ""
};

const blankPaymentPlanProposal = () => ({
  installment_amount: "",
  frequency: "monthly",
  preferred_first_due_date: ""
});

const blankBillingDispute = () => ({
  bill_id: "",
  reason: "usage"
});

const blankConnectionRequest = () => ({
  request_type: "new_connection",
  site_location: "",
  landmark: "",
  access_contact_name: "",
  access_contact_phone: "",
  preferred_inspection_date: "",
  access_notes: ""
});

const blankReadingSubmission = () => ({
  reading_value: "",
  reading_date: todayLocal(),
  notes: ""
});

const pdfEscape = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const mmToPoints = (value) => Number(value || 0) * 2.8346456693;

const statementPdfConfig = (settings = {}) => {
  const normalized = normalizePrintSettings(settings);
  const page = getPrintPageDimensionsMm(normalized);
  const scale = (normalized.print_fit_to_page ? Math.min(normalized.print_scale_percent, 95) : normalized.print_scale_percent) / 100;
  const width = mmToPoints(page.width);
  const height = mmToPoints(page.height);
  const margin = mmToPoints(normalized.print_margin_mm);
  const fontSize = Math.max(8, 10 * scale);
  const lineHeight = Math.max(11, 14 * scale);
  const charsPerLine = Math.max(70, Math.floor((width - margin * 2) / (fontSize * 0.52)));
  const linesPerPage = Math.max(20, Math.floor((height - margin * 2) / lineHeight) - 1);
  return { width, height, margin, fontSize, lineHeight, charsPerLine, linesPerPage };
};

const pdfDocumentText = (value, maxLength = 120) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
const pdfColor = (color) => color.map((value) => Number(value).toFixed(3)).join(" ");
const pdfFillRect = (x, y, width, height, color) => `q ${pdfColor(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`;
const pdfTextAt = (font, size, x, y, value, color = [0.094, 0.141, 0.227], maxLength = 120) =>
  `BT /${font} ${size.toFixed(2)} Tf ${pdfColor(color)} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(pdfDocumentText(value, maxLength))}) Tj ET`;
const pdfMoney = (value) => `KES ${Math.abs(Number(value || 0)).toLocaleString()}`;

const downloadStatementPdf = (filename, statement, businessSettings = {}, printSettings = {}) => {
  const config = statementPdfConfig(printSettings);
  const teal = [0.059, 0.463, 0.431];
  const ink = [0.094, 0.141, 0.227];
  const muted = [0.278, 0.384, 0.451];
  const paleTeal = [0.898, 0.949, 0.937];
  const paleGray = [0.969, 0.976, 0.980];
  const border = [0.790, 0.847, 0.863];
  const contentWidth = config.width - config.margin * 2;
  const tableY = config.height - config.margin - 116;
  const rowHeight = 20;
  const rowsPerPage = Math.max(8, Math.floor((tableY - config.margin - 46) / rowHeight));
  const entries = statement.transactions || [];
  const transactionPages = [];
  for (let index = 0; index < entries.length; index += rowsPerPage) transactionPages.push(entries.slice(index, index + rowsPerPage));
  if (!transactionPages.length) transactionPages.push([]);
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];

  transactionPages.forEach((pageRows, pageIndex) => {
    const commands = [];
    const headerBottom = config.height - config.margin - 46;
    const balanceLabel = accountPositionLabel(statement.totals.closing_balance);
    const amountWidth = Math.max(55, Math.min(78, contentWidth * 0.17));
    const dateWidth = Math.max(42, Math.min(56, contentWidth * 0.11));
    const columns = {
      date: config.margin + 8,
      reference: config.margin + dateWidth + 8,
      debit: config.margin + contentWidth - amountWidth * 3,
      credit: config.margin + contentWidth - amountWidth * 2,
      balance: config.margin + contentWidth - amountWidth
    };
    const referenceLength = Math.max(16, Math.floor((columns.debit - columns.reference - 8) / 4.1));

    commands.push(pdfFillRect(config.margin, headerBottom, contentWidth, 46, paleGray));
    commands.push(pdfFillRect(config.margin, headerBottom, 4, 46, teal));
    commands.push(pdfTextAt("F2", 13, config.margin + 14, headerBottom + 29, businessSettings.business_name || "Water Billing", ink));
    commands.push(pdfTextAt("F1", 7.5, config.margin + 14, headerBottom + 15, businessSettings.legal_name || businessSettings.physical_address || "Customer account statement", muted));
    commands.push(pdfTextAt("F2", 7.5, config.margin + contentWidth - 145, headerBottom + 29, "Customer Statement", teal));
    commands.push(pdfTextAt("F1", 7.5, config.margin + contentWidth - 145, headerBottom + 15, pageIndex === 0 ? "Account ledger" : "Continued ledger", muted));

    commands.push(pdfTextAt("F2", 9.5, config.margin, headerBottom - 15, statement.customer.name || "Customer"));
    commands.push(pdfTextAt("F1", 7.5, config.margin, headerBottom - 27, `Account ${statement.customer.acc_number || "-"} | Zone ${statement.customer.zone_name || "-"}`, muted));
    commands.push(pdfTextAt("F1", 7.5, config.margin, headerBottom - 39, statement.period.lifetime ? "Period: Lifetime" : `Period: ${statement.period.start_date || "Start"} to ${statement.period.end_date || "End"}`, muted));
    commands.push(pdfTextAt("F2", 8.5, config.margin + contentWidth - 158, headerBottom - 15, balanceLabel, ink));
    commands.push(pdfTextAt("F2", 10.5, config.margin + contentWidth - 158, headerBottom - 29, pdfMoney(statement.totals.closing_balance), teal));

    commands.push(pdfFillRect(config.margin, tableY, contentWidth, 18, paleTeal));
    commands.push(pdfFillRect(config.margin, tableY, contentWidth, 0.8, border));
    commands.push(pdfTextAt("F2", 7.5, columns.date, tableY + 6, "DATE", muted));
    commands.push(pdfTextAt("F2", 7.5, columns.reference, tableY + 6, "REFERENCE", muted));
    commands.push(pdfTextAt("F2", 7.5, columns.debit, tableY + 6, "DEBIT", muted));
    commands.push(pdfTextAt("F2", 7.5, columns.credit, tableY + 6, "CREDIT", muted));
    commands.push(pdfTextAt("F2", 7.5, columns.balance, tableY + 6, "BALANCE", muted));

    pageRows.forEach((row, rowIndex) => {
      const rowY = tableY - (rowIndex + 1) * rowHeight;
      if (rowIndex % 2 === 1) commands.push(pdfFillRect(config.margin, rowY, contentWidth, rowHeight, paleGray));
      commands.push(pdfFillRect(config.margin, rowY, contentWidth, 0.35, border));
      commands.push(pdfTextAt("F1", 8, columns.date, rowY + 7, date(row.transaction_date), ink));
      commands.push(pdfTextAt("F1", 8, columns.reference, rowY + 7, row.reference || "-", ink, referenceLength));
      commands.push(pdfTextAt("F1", 8, columns.debit, rowY + 7, Number(row.debit || 0) ? pdfMoney(row.debit) : "-", ink));
      commands.push(pdfTextAt("F1", 8, columns.credit, rowY + 7, Number(row.credit || 0) ? pdfMoney(row.credit) : "-", ink));
      commands.push(pdfTextAt("F2", 8, columns.balance, rowY + 7, pdfMoney(row.running_balance), ink));
    });

    if (pageIndex === transactionPages.length - 1) {
      const totalY = config.margin + 22;
      commands.push(pdfFillRect(config.margin, totalY, contentWidth, 32, paleTeal));
      commands.push(pdfTextAt("F2", 8, config.margin + 8, totalY + 19, `Total debits ${pdfMoney(statement.totals.debit)}`, ink));
      commands.push(pdfTextAt("F2", 8, config.margin + contentWidth / 3 + 8, totalY + 19, `Total credits ${pdfMoney(statement.totals.credit)}`, ink));
      commands.push(pdfTextAt("F2", 8, config.margin + (contentWidth * 2) / 3 + 8, totalY + 19, `${balanceLabel} ${pdfMoney(statement.totals.closing_balance)}`, teal));
    }
    commands.push(pdfTextAt("F1", 7, config.margin, config.margin + 5, `${businessSettings.business_name || "Water Billing"} | Customer statement`, muted));
    commands.push(pdfTextAt("F1", 7, config.margin + contentWidth - 65, config.margin + 5, `Page ${pageIndex + 1} of ${transactionPages.length}`, muted));

    const content = commands.join("\n");
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${config.width.toFixed(2)} ${config.height.toFixed(2)}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pageIds.forEach((pageId) => {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  });
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(chunks.join("").length);
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = chunks.join("").length;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  downloadBlobFile(new Blob([chunks.join("")], { type: "application/pdf" }), filename, "pdf");
};

function PortalPage({ view = "overview" }) {
  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [requestForm, setRequestForm] = useState(blankRequest);
  const [paymentPlanProposal, setPaymentPlanProposal] = useState(blankPaymentPlanProposal);
  const [billingDispute, setBillingDispute] = useState(blankBillingDispute);
  const [connectionRequest, setConnectionRequest] = useState(blankConnectionRequest);
  const [readingSubmissionForm, setReadingSubmissionForm] = useState(blankReadingSubmission);
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedReadingSubmission, setSelectedReadingSubmission] = useState(null);
  const [statement, setStatement] = useState(null);
  const [statementFilters, setStatementFilters] = useState({ start_date: "", end_date: "" });
  const [printTarget, setPrintTarget] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [deliveryPreferences, setDeliveryPreferences] = useState(null);
  const [, setMessage] = useToastMessage();
  const [saving, setSaving] = useState(false);
  const [readingSubmissionSaving, setReadingSubmissionSaving] = useState(false);
  const [deliveryPreferencesSaving, setDeliveryPreferencesSaving] = useState(false);

  const openBalance = useMemo(() => Number(data?.summary?.balance_due || 0), [data]);
  const activeRequests = useMemo(() => Number(data?.summary?.active_requests || 0), [data]);
  const consumptionPaymentTrend = data?.charts?.consumptionPaymentTrend || [];
  const consumptionPaymentTrendMax = useMemo(
    () =>
      paddedChartMax(
        consumptionPaymentTrend.reduce(
          (max, row) => Math.max(max, Number(row.billed_amount || 0), Number(row.paid_amount || 0)),
          0
        )
      ),
    [consumptionPaymentTrend]
  );
  const consumptionTrendMax = useMemo(
    () => paddedChartMax(consumptionPaymentTrend.reduce((max, row) => Math.max(max, Number(row.units_used || 0)), 0)),
    [consumptionPaymentTrend]
  );
  const hasConsumptionData = consumptionPaymentTrend.some((row) => Number(row.units_used || 0) > 0);
  const usageBenchmark = data?.usageBenchmark || null;
  const usageVariance = Number(usageBenchmark?.variance_percent || 0);
  const usagePosition = usageVariance > 5 ? "higher" : usageVariance < -5 ? "lower" : "in line";
  const billTable = useTableControls(data?.bills || [], {
    searchFields: ["bill_number", "billing_period_name", "billing_month", "due_date", "status"]
  });
  const receiptTable = useTableControls(data?.payments || [], {
    searchFields: ["receipt_number", "bill_numbers", "payment_date", "payment_channel", "amount"]
  });
  const requestTable = useTableControls(data?.serviceRequests || [], {
    searchFields: ["request_number", "title", "category", "status", "reported_at"]
  });
  const readingSubmissionTable = useTableControls(data?.readingSubmissions || [], {
    searchFields: ["meter_number", "reading_date", "reading_value", "notes", "status"]
  });
  const viewTitles = {
    overview: data?.customer?.name || "Portal",
    bills: "Bills",
    receipts: "Receipts",
    requests: "Requests"
  };

  const load = async (customerId = selectedCustomerId, { showInitialState = false } = {}) => {
    if (showInitialState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const nextData = await api.portal.dashboard(customerId);
      setData(nextData);
      setSelectedCustomerId(String(nextData.activeCustomerId || nextData.customer?.id || ""));
    } catch (err) {
      if (showInitialState) setInitialError(err.message || "Your account information could not be loaded.");
      throw err;
    } finally {
      if (showInitialState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load(undefined, { showInitialState: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (data?.deliveryPreferences) setDeliveryPreferences(data.deliveryPreferences);
  }, [data?.activeCustomerId, data?.deliveryPreferences]);

  useEffect(() => {
    const clearPrintTarget = () => setPrintTarget("");
    window.addEventListener("afterprint", clearPrintTarget);
    return () => window.removeEventListener("afterprint", clearPrintTarget);
  }, []);

  const switchAccount = async (customerId) => {
    setMessage("");
    setSelectedBill(null);
    setSelectedReceipt(null);
    setSelectedRequest(null);
    setSelectedReadingSubmission(null);
    setStatement(null);
    setPrintTarget("");
    setSelectedCustomerId(customerId);
    try {
      await load(customerId);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const setRequestField = (field, value) => {
    setRequestForm((current) => ({ ...current, [field]: value }));
  };

  const setPaymentPlanProposalField = (field, value) => {
    setPaymentPlanProposal((current) => ({ ...current, [field]: value }));
  };

  const setBillingDisputeField = (field, value) => {
    setBillingDispute((current) => ({ ...current, [field]: value }));
  };

  const setConnectionRequestField = (field, value) => {
    setConnectionRequest((current) => ({ ...current, [field]: value }));
  };

  const setReadingSubmissionField = (field, value) => {
    setReadingSubmissionForm((current) => ({ ...current, [field]: value }));
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!requestForm.description.trim()) {
      setMessage("Please add a few details before submitting.");
      return;
    }
    if (requestForm.category === "payment_plan") {
      if (!Number.isFinite(Number(paymentPlanProposal.installment_amount)) || Number(paymentPlanProposal.installment_amount) <= 0) {
        setMessage("Enter the instalment amount you can pay.");
        return;
      }
      if (!paymentPlanProposal.preferred_first_due_date) {
        setMessage("Choose your preferred first payment date.");
        return;
      }
    }
    if (requestForm.category === "billing_dispute") {
      if (!billingDispute.bill_id) {
        setMessage("Select the bill you want staff to review.");
        return;
      }
      if (!billingDispute.reason) {
        setMessage("Choose why you are disputing this bill.");
        return;
      }
    }
    if (requestForm.category === "connection") {
      if (!connectionRequest.site_location.trim()) {
        setMessage("Add the site or location for the connection inspection.");
        return;
      }
    }
    setSaving(true);
    try {
      const request = await api.portal.createServiceRequest({
        ...requestForm,
        customer_id: selectedCustomerId || data.customer.id,
        payment_plan_proposal: requestForm.category === "payment_plan" ? paymentPlanProposal : undefined,
        billing_dispute: requestForm.category === "billing_dispute" ? billingDispute : undefined,
        connection_request: requestForm.category === "connection" ? connectionRequest : undefined
      });
      setRequestForm(blankRequest);
      setPaymentPlanProposal(blankPaymentPlanProposal());
      setBillingDispute(blankBillingDispute());
      setConnectionRequest(blankConnectionRequest());
      await load();
      setSelectedRequest(request);
      setMessage("Service request submitted. You can now attach supporting files.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReadingSubmission = async (event) => {
    event.preventDefault();
    setMessage("");
    if (readingSubmissionForm.reading_value === "") {
      setMessage("Enter the meter reading before submitting.");
      return;
    }
    setReadingSubmissionSaving(true);
    try {
      const submission = await api.portal.createReadingSubmission({
        reading_value: Number(readingSubmissionForm.reading_value),
        reading_date: readingSubmissionForm.reading_date,
        notes: readingSubmissionForm.notes.trim()
      });
      setReadingSubmissionForm(blankReadingSubmission());
      await load();
      setSelectedReadingSubmission(submission);
      setMessage("Meter reading submitted for review. Billing will update only after approval.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setReadingSubmissionSaving(false);
    }
  };

  const updateDeliveryPreference = (field, value) => setDeliveryPreferences((current) => ({ ...current, [field]: value }));

  const submitDeliveryPreferences = async (event) => {
    event.preventDefault();
    if (!deliveryPreferences || deliveryPreferencesSaving) return;
    setDeliveryPreferencesSaving(true);
    setMessage("");
    try {
      const updated = await api.portal.updateDeliveryPreferences({
        preferred_delivery_channel: deliveryPreferences.preferred_delivery_channel,
        email_delivery_enabled: Boolean(deliveryPreferences.email_delivery_enabled),
        sms_delivery_enabled: Boolean(deliveryPreferences.sms_delivery_enabled),
        whatsapp_delivery_enabled: Boolean(deliveryPreferences.whatsapp_delivery_enabled)
      });
      setDeliveryPreferences(updated);
      setData((current) => ({ ...current, deliveryPreferences: updated }));
      setMessage("Delivery preferences updated.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDeliveryPreferencesSaving(false);
    }
  };

  const openReceipt = async (paymentId) => {
    setMessage("");
    try {
      setSelectedBill(null);
      setStatement(null);
      setSelectedReceipt(await api.portal.getPayment(paymentId, selectedCustomerId || data.customer.id));
    } catch (err) {
      setMessage(err.message);
    }
  };

  const openBill = (bill) => {
    setSelectedReceipt(null);
    setStatement(null);
    setSelectedBill(bill);
  };

  const printDocumentTitle = (target = "") => {
    const account = data?.customer?.acc_number || "account";
    if (target === "statement") return `customer statement ${account}`;
    if (selectedReceipt) return `receipt ${selectedReceipt.payment?.receipt_number || selectedReceipt.payment?.id || "payment"} ${account}`;
    if (selectedBill) return `bill ${selectedBill.bill_number || selectedBill.id || "billing"} ${account}`;
    return `${viewTitles[view] || "customer portal"} ${account}`;
  };

  const printDocument = (target = "") => {
    setPrintTarget(target);
    setTimeout(() => withPrintTitle(printDocumentTitle(target), () => window.print(), data?.business), 50);
  };

  const fetchStatement = async () => {
    const params = Object.fromEntries(
      Object.entries(statementFilters).filter(([, value]) => String(value || "").trim())
    );
    const nextStatement = await api.customers.statement(selectedCustomerId || data.customer.id, params);
    setStatement(nextStatement);
    return nextStatement;
  };

  const previewStatement = async () => {
    setMessage("");
    try {
      await fetchStatement();
      setMessage("Statement loaded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const downloadStatement = async () => {
    setMessage("");
    try {
      const nextStatement = statement || (await fetchStatement());
      downloadStatementPdf(
        namedExport("customer-statement", "pdf", [
          nextStatement.customer.acc_number,
          nextStatement.period.lifetime ? "lifetime" : `${nextStatement.period.start_date || "start"} to ${nextStatement.period.end_date || "end"}`
        ]),
        nextStatement,
        data?.business,
        data?.business
      );
      setMessage("Statement PDF downloaded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const printStatement = async () => {
    setMessage("");
    try {
      await fetchStatement();
      printDocument("statement");
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving your account, bills, receipts, and service activity." title="Preparing your water account" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={() => load(undefined, { showInitialState: true }).catch(() => {})}
        state="error"
        title="Your water account could not load"
      />
    );
  }

  if (!data) {
    return <WorkspaceState detail="Retrieving your account information." title="Preparing your water account" />;
  }

  return (
    <section className={`page-stack customer-portal-page customer-portal-${view}`}>
      <header className="page-header customer-portal-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h2>{view === "overview" ? "Your water account" : viewTitles[view] || data.customer.name}</h2>
          <p>
            {data.customer.acc_number} | {data.customer.zone_name}
          </p>
        </div>
        {data.portalAccounts?.length > 1 ? (
          <label className="portal-account-switcher screen-only">
            Account
            <select value={selectedCustomerId || data.customer.id} onChange={(event) => switchAccount(event.target.value)}>
              {data.portalAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.acc_number} - {account.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {view === "overview" ? (
        <>
          <PortalAccountSnapshot
            accountPositionLabel={accountPositionLabel}
            activeRequests={activeRequests}
            consumptionPaymentTrend={consumptionPaymentTrend}
            consumptionPaymentTrendMax={consumptionPaymentTrendMax}
            consumptionTrendMax={consumptionTrendMax}
            data={data}
            date={date}
            formatCompact={formatCompact}
            hasConsumptionData={hasConsumptionData}
            label={label}
            money={money}
            moneyAbs={moneyAbs}
            moneyTooltip={moneyTooltip}
            number={number}
            openBalance={openBalance}
            unitsTooltip={unitsTooltip}
            usageBenchmark={usageBenchmark}
            usagePosition={usagePosition}
            usageVariance={usageVariance}
          />

          <PortalDeliveryPreferencesPanel
            onFieldChange={updateDeliveryPreference}
            onSubmit={submitDeliveryPreferences}
            preferences={deliveryPreferences}
            saving={deliveryPreferencesSaving}
          />
          <PortalStatementWorkspace
            accountPositionLabel={accountPositionLabel}
            data={data}
            date={date}
            filters={statementFilters}
            money={money}
            moneyAbs={moneyAbs}
            onDownload={downloadStatement}
            onFilterChange={(field, value) => {
              setStatement(null);
              setStatementFilters((current) => ({ ...current, [field]: value }));
            }}
            onPreview={previewStatement}
            onPrint={printStatement}
            printActive={printTarget === "statement"}
            statement={statement}
          />
        </>
      ) : null}

      {view === "bills" ? (
        <section className="workspace-grid portal-workspace-grid">
          <div className="page-stack">
          <div className="panel">
            <div className="panel-heading">
              <h3>Bills</h3>
              <FileText size={18} />
            </div>
            <TableControls table={billTable} label="bills" placeholder="Search bills" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Due</th>
                    <th>Units</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billTable.visibleRows.length ? (
                    billTable.visibleRows.map((bill) => (
                      <tr key={bill.id}>
                        <td>
                          {bill.bill_number || `Bill ${bill.id}`}
                          <small>{bill.billing_period_name || date(bill.billing_month)}</small>
                        </td>
                        <td>{date(bill.due_date)}</td>
                        <td>{number(bill.units_used)}</td>
                        <td>{money(bill.total_amount)}</td>
                        <td>{money(bill.balance_amount)}</td>
                        <td>
                          <StatusBadge status={bill.status} />
                        </td>
                        <td>
                          <button type="button" onClick={() => openBill(bill)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow
                      colSpan={7}
                      title="No bills yet"
                      detail="Your bills will appear here after meter readings are processed."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </section>
      ) : null}

      {view === "receipts" ? (
        <section className="workspace-grid portal-workspace-grid">
          <div className="page-stack">
            <div className="panel">
            <div className="panel-heading">
              <h3>Receipts</h3>
              <ReceiptText size={18} />
            </div>
            <TableControls table={receiptTable} label="receipts" placeholder="Search receipts" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Channel</th>
                    <th>Amount</th>
                    <th>Credit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptTable.visibleRows.length ? (
                    receiptTable.visibleRows.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          {payment.receipt_number}
                          <small>{payment.bill_numbers || "-"}</small>
                        </td>
                        <td>{date(payment.payment_date)}</td>
                        <td>{label(payment.payment_channel)}</td>
                        <td>{money(payment.amount)}</td>
                        <td>{money(payment.unallocated_amount)}</td>
                        <td>
                          <button type="button" onClick={() => openReceipt(payment.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow
                      colSpan={6}
                      title="No receipts yet"
                      detail="Posted payments and downloadable receipts will appear here."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </section>
      ) : null}

      {view === "requests" ? (
        <section className="workspace-grid portal-workspace-grid">
          <div className="page-stack">
          <PortalServiceRequestWorkspace
            bills={data?.bills || []}
            billingDispute={billingDispute}
            connectionRequest={connectionRequest}
            currentDate={todayLocal()}
            customerId={selectedCustomerId || data.customer.id}
            date={date}
            label={label}
            money={money}
            onBillingDisputeChange={setBillingDisputeField}
            onCategoryChange={(category) => {
              setRequestField("category", category);
              if (category !== "payment_plan") setPaymentPlanProposal(blankPaymentPlanProposal());
              if (category !== "billing_dispute") setBillingDispute(blankBillingDispute());
              if (category !== "connection") setConnectionRequest(blankConnectionRequest());
            }}
            onCloseRequest={() => setSelectedRequest(null)}
            onConnectionChange={setConnectionRequestField}
            onPaymentPlanChange={setPaymentPlanProposalField}
            onRequestFieldChange={setRequestField}
            onSelectRequest={setSelectedRequest}
            onSubmit={submitRequest}
            openBalance={openBalance}
            paymentPlanProposal={paymentPlanProposal}
            requestForm={requestForm}
            saving={saving}
            selectedRequest={selectedRequest}
            table={requestTable}
          >
            <PortalReadingSubmissionWorkspace
              customerId={selectedCustomerId || data.customer.id}
              currentDate={todayLocal()}
              data={data}
              date={date}
              form={readingSubmissionForm}
              number={number}
              onCloseEvidence={() => setSelectedReadingSubmission(null)}
              onEvidence={setSelectedReadingSubmission}
              onFieldChange={setReadingSubmissionField}
              onSubmit={submitReadingSubmission}
              saving={readingSubmissionSaving}
              selectedSubmission={selectedReadingSubmission}
              table={readingSubmissionTable}
            />
          </PortalServiceRequestWorkspace>

        </div>
        </section>
      ) : null}

      {selectedBill ? (
        <div className="panel print-surface receipt-print">
          <div className="receipt-actions screen-only">
            <button type="button" onClick={() => printDocument()}>
              <Printer size={17} />
              Print / PDF
            </button>
            <button type="button" onClick={() => setSelectedBill(null)} title="Close bill">
              <X size={17} />
              Close
            </button>
          </div>

          <DocumentPrintHeader
            businessSettings={data.business}
            dateLabel={`Due ${date(selectedBill.due_date)}`}
            documentLabel="Customer bill"
            documentNumber={selectedBill.bill_number || `Bill ${selectedBill.id}`}
          />

          <div className="receipt-title">
            <div>
              <span>Bill</span>
              <strong>{selectedBill.bill_number || `Bill ${selectedBill.id}`}</strong>
            </div>
            <div>
              <span>Due Date</span>
              <strong>{date(selectedBill.due_date)}</strong>
            </div>
          </div>

          <div className="receipt-info-grid">
            <div>
              <span>Customer</span>
              <strong>{data.customer.name}</strong>
              <small>{data.customer.acc_number}</small>
            </div>
            <div>
              <span>Zone</span>
              <strong>{data.customer.zone_name}</strong>
            </div>
            <div>
              <span>Billing Period</span>
              <strong>{selectedBill.billing_period_name || date(selectedBill.billing_month)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{label(selectedBill.status)}</strong>
            </div>
          </div>

          <table className="receipt-table">
            <thead>
              <tr>
                <th>Previous</th>
                <th>Current</th>
                <th>Units</th>
                <th>Rate</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{number(selectedBill.previous_reading)}</td>
                <td>{number(selectedBill.current_reading)}</td>
                <td>{number(selectedBill.units_used)}</td>
                <td>{money(selectedBill.rate)}</td>
                <td>{money(selectedBill.subtotal_amount || selectedBill.total_amount)}</td>
              </tr>
            </tbody>
          </table>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {nonZeroChargeRows(selectedBill).map(([title, amount]) => (
                  <tr key={title}>
                    <td>{title}</td>
                    <td>{money(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="receipt-total">
            <span>Total billed</span>
            <strong>{money(selectedBill.total_amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Paid / credit applied</span>
            <strong>{money(selectedBill.paid_amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Amount due</span>
            <strong>{money(selectedBill.balance_amount)}</strong>
          </div>

          <div className="receipt-footer">
            {data.business?.paybill_number ? <p>Paybill: {data.business.paybill_number}</p> : null}
            {data.business?.till_number ? <p>Till: {data.business.till_number}</p> : null}
            {data.business?.receipt_footer_note ? <p>{data.business.receipt_footer_note}</p> : null}
            <small>{data.business?.business_name || "Water Billing"} customer bill</small>
          </div>
        </div>
      ) : null}

      {selectedReceipt ? (
        <div className="panel print-surface receipt-print">
          <div className="receipt-actions screen-only">
            <button type="button" onClick={() => printDocument()}>
              <Printer size={17} />
              Print / PDF
            </button>
            <button type="button" onClick={() => setSelectedReceipt(null)} title="Close receipt">
              <X size={17} />
              Close
            </button>
          </div>

          <DocumentPrintHeader
            businessSettings={data.business}
            dateLabel={date(selectedReceipt.payment.payment_date)}
            documentLabel="Receipt"
            documentNumber={selectedReceipt.payment.receipt_number || `RCPT-${selectedReceipt.payment.id}`}
          />

          <div className="receipt-title">
            <div>
              <span>Receipt</span>
              <strong>{selectedReceipt.payment.receipt_number || `RCPT-${selectedReceipt.payment.id}`}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{date(selectedReceipt.payment.payment_date)}</strong>
            </div>
          </div>

          <div className="receipt-info-grid">
            <div>
              <span>Received From</span>
              <strong>{selectedReceipt.payment.received_from || selectedReceipt.payment.customer_name}</strong>
            </div>
            <div>
              <span>Customer</span>
              <strong>{selectedReceipt.payment.customer_name}</strong>
              <small>{selectedReceipt.payment.acc_number}</small>
            </div>
            <div>
              <span>Channel</span>
              <strong>{label(selectedReceipt.payment.payment_channel || selectedReceipt.payment.method)}</strong>
            </div>
            <div>
              <span>Reference</span>
              <strong>{selectedReceipt.payment.external_reference || selectedReceipt.payment.reference || "-"}</strong>
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
              {selectedReceipt.allocations.length ? (
                selectedReceipt.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>{allocation.bill_number || `Bill ${allocation.bill_id}`}</td>
                    <td>{date(allocation.billing_month)}</td>
                    <td>{money(allocation.bill_total)}</td>
                    <td>{money(allocation.amount)}</td>
                    <td>{money(allocation.balance_amount)}</td>
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
            <strong>{money(selectedReceipt.payment.amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Allocated to bills</span>
            <strong>{money(selectedReceipt.payment.total_allocated_amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Customer credit</span>
            <strong>{money(selectedReceipt.payment.unallocated_amount)}</strong>
          </div>

          <div className="receipt-footer">
            {data.business?.paybill_number ? <p>Paybill: {data.business.paybill_number}</p> : null}
            {data.business?.till_number ? <p>Till: {data.business.till_number}</p> : null}
            {data.business?.receipt_footer_note ? <p>{data.business.receipt_footer_note}</p> : null}
            <small>{data.business?.business_name || "Water Billing"} customer receipt</small>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default PortalPage;
