import { Download, FileText, LifeBuoy, Printer, ReceiptText, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { api, assetUrl } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const moneyAbs = (value) => `KES ${Math.abs(Number(value || 0)).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
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
  title: "",
  category: "leak",
  priority: "normal",
  description: ""
};

const EmptyState = ({ title, detail, colSpan }) => (
  <tr>
    <td colSpan={colSpan}>
      <div className="empty-state">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </td>
  </tr>
);

const pdfEscape = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const downloadTextPdf = (filename, pages) => {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  pages.forEach((lines) => {
    const content = [
      "BT",
      "/F1 10 Tf",
      "14 TL",
      ...lines.map((line, index) => `1 0 0 1 50 ${790 - index * 14} Tm (${pdfEscape(line).slice(0, 110)}) Tj`),
      "ET"
    ].join("\n");
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

  const blob = new Blob([chunks.join("")], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const buildStatementPdfPages = (statement) => {
  const header = [
    `${statement.customer.name} Statement`,
    `Account: ${statement.customer.acc_number} | Zone: ${statement.customer.zone_name}`,
    statement.period.lifetime ? "Period: Lifetime" : `Period: ${statement.period.start_date || "Start"} to ${statement.period.end_date || "End"}`,
    `Opening Balance: ${money(statement.opening_balance)}`,
    ""
  ];
  const rows = statement.transactions.map(
    (row) =>
      `${date(row.transaction_date)} | ${row.reference} | Dr ${money(row.debit)} | Cr ${money(row.credit)} | Bal ${money(row.running_balance)}`
  );
  const footer = [
    "",
    `Total Debits: ${money(statement.totals.debit)}`,
    `Total Credits: ${money(statement.totals.credit)}`,
    `${accountPositionLabel(statement.totals.closing_balance)}: ${moneyAbs(statement.totals.closing_balance)}`
  ];
  const allLines = [...header, ...rows, ...footer];
  const pages = [];
  for (let index = 0; index < allLines.length; index += 52) {
    pages.push(allLines.slice(index, index + 52));
  }
  return pages.length ? pages : [header];
};

function PortalPage({ view = "overview" }) {
  const [data, setData] = useState(null);
  const [requestForm, setRequestForm] = useState(blankRequest);
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const openBalance = useMemo(() => Number(data?.summary?.balance_due || 0), [data]);
  const activeRequests = useMemo(() => Number(data?.summary?.active_requests || 0), [data]);
  const billTable = useTableControls(data?.bills || [], {
    searchFields: ["bill_number", "billing_period_name", "billing_month", "due_date", "status"]
  });
  const receiptTable = useTableControls(data?.payments || [], {
    searchFields: ["receipt_number", "bill_numbers", "payment_date", "payment_channel", "amount"]
  });
  const requestTable = useTableControls(data?.serviceRequests || [], {
    searchFields: ["request_number", "title", "category", "status", "reported_at"]
  });
  const viewTitles = {
    overview: data?.customer?.name || "Portal",
    bills: "Bills",
    receipts: "Receipts",
    requests: "Requests"
  };

  const load = async () => {
    setData(await api.portal.dashboard());
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setRequestField = (field, value) => {
    setRequestForm((current) => ({ ...current, [field]: value }));
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!requestForm.title.trim() || !requestForm.description.trim()) {
      setMessage("Please add a subject and a few details before submitting.");
      return;
    }
    setSaving(true);
    try {
      await api.portal.createServiceRequest(requestForm);
      setRequestForm(blankRequest);
      await load();
      setMessage("Service request submitted.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (paymentId) => {
    setMessage("");
    try {
      setSelectedBill(null);
      setSelectedReceipt(await api.portal.getPayment(paymentId));
    } catch (err) {
      setMessage(err.message);
    }
  };

  const openBill = (bill) => {
    setSelectedReceipt(null);
    setSelectedBill(bill);
  };

  const printDocument = () => {
    setTimeout(() => window.print(), 50);
  };

  const downloadStatement = async () => {
    setMessage("");
    try {
      const statement = await api.customers.statement(data.customer.id);
      downloadTextPdf(`${data.customer.acc_number}-statement.pdf`, buildStatementPdfPages(statement));
      setMessage("Statement PDF downloaded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!data) {
    return <p className="muted">Loading portal...</p>;
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h2>{viewTitles[view] || data.customer.name}</h2>
          <p className="muted">
            {data.customer.acc_number} | {data.customer.zone_name}
          </p>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      {view === "overview" ? (
        <div className="row-actions screen-only">
          <button type="button" onClick={downloadStatement}>
            <Download size={16} />
            Statement PDF
          </button>
        </div>
      ) : null}

      {view === "overview" ? (
        <>
          <div className="stat-grid">
            <StatCard label={accountPositionLabel(openBalance)} value={moneyAbs(openBalance)} detail="Net account position" />
            <StatCard label="Open bills" value={number(data.summary.open_bills)} detail="Unpaid or partial bills" />
            <StatCard label="Available credit" value={money(data.summary.credit_balance)} detail="Auto-applies to new bills" />
            <StatCard label="Open requests" value={number(activeRequests)} detail="Service requests in progress" />
          </div>

          <div className="panel portal-profile-panel">
            <div className="panel-heading">
              <h3>Account Summary</h3>
            </div>
            <div className="portal-profile-grid">
              <div>
                <span>Account</span>
                <strong>{data.customer.acc_number}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{data.customer.phone || "-"}</strong>
              </div>
              <div>
                <span>Zone</span>
                <strong>{data.customer.zone_name}</strong>
              </div>
              <div>
                <span>Tariff</span>
                <strong>{data.customer.rate_name}</strong>
                <small>{money(data.customer.rate_amount)}</small>
              </div>
              <div>
                <span>Deposit</span>
                <strong>{data.customer.deposit_paid ? "Paid" : "Not paid"}</strong>
                <small>{money(data.customer.deposit_amount)}</small>
              </div>
              <div>
                <span>Latest Reading</span>
                <strong>{data.latestReading ? number(data.latestReading.reading_value) : "-"}</strong>
                <small>{data.latestReading ? `${data.latestReading.meter_number || "Meter"} | ${date(data.latestReading.reading_date)}` : "No reading yet"}</small>
              </div>
              <div>
                <span>Account Status</span>
                <strong>{label(data.customer.status)}</strong>
              </div>
              <div>
                <span>Total Paid</span>
                <strong>{money(data.summary.lifetime_paid)}</strong>
              </div>
              <div>
                <span>Customer Credit</span>
                <strong>{money(data.summary.credit_balance)}</strong>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {view === "bills" ? (
        <section className="workspace-grid">
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
                  {billTable.total ? (
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
                    <EmptyState
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
        <section className="workspace-grid">
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
                  {receiptTable.total ? (
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
                    <EmptyState
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
        <section className="workspace-grid">
          <div className="page-stack">
          <form className="panel form-grid" onSubmit={submitRequest}>
            <div className="panel-heading">
              <h3>Submit Request</h3>
              <LifeBuoy size={18} />
            </div>
            <label>
              Subject
              <input
                value={requestForm.title}
                onChange={(event) => setRequestField("title", event.target.value)}
                maxLength={180}
                placeholder="Example: Low pressure at my connection"
                required
              />
            </label>
            <label>
              Category
              <select value={requestForm.category} onChange={(event) => setRequestField("category", event.target.value)}>
                <option value="leak">Leak</option>
                <option value="meter_fault">Meter fault</option>
                <option value="no_water">No water</option>
                <option value="low_pressure">Low pressure</option>
                <option value="water_quality">Water quality</option>
                <option value="connection">Connection</option>
                <option value="billing_support">Billing support</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Priority
              <select value={requestForm.priority} onChange={(event) => setRequestField("priority", event.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Details
              <textarea
                value={requestForm.description}
                onChange={(event) => setRequestField("description", event.target.value)}
                rows="4"
                maxLength={2000}
                placeholder="Add location details, when the issue started, and any useful notes."
                required
              />
            </label>
            <p className="muted">Requests are sent to the operations team and will appear in your request history.</p>
            <button className="primary-button" type="submit" disabled={saving}>
              <Send size={17} />
              Submit request
            </button>
          </form>

          <div className="panel">
            <div className="panel-heading">
              <h3>Service Requests</h3>
            </div>
            <TableControls table={requestTable} label="requests" placeholder="Search requests" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {requestTable.total ? (
                    requestTable.visibleRows.map((request) => (
                      <tr key={request.id}>
                        <td>
                          {request.request_number || `Request ${request.id}`}
                          <small>{request.title}</small>
                        </td>
                        <td>{label(request.category)}</td>
                        <td>
                          <StatusBadge status={request.status} />
                        </td>
                        <td>{date(request.reported_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyState
                      colSpan={4}
                      title="No service requests yet"
                      detail="Use the request form above to report leaks, meter faults, or supply concerns."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </section>
      ) : null}

      {selectedBill ? (
        <div className="panel print-surface receipt-print">
          <div className="receipt-actions screen-only">
            <button type="button" onClick={printDocument}>
              <Printer size={17} />
              Print bill
            </button>
            <button type="button" onClick={() => setSelectedBill(null)} title="Close bill">
              <X size={17} />
              Close
            </button>
          </div>

          <div className="receipt-header">
            {data.business?.logo_url ? (
              <img className="receipt-logo" src={assetUrl(data.business.logo_url)} alt="Business logo" />
            ) : (
              <div className="receipt-logo-mark">{data.business?.business_name?.slice(0, 2) || "AG"}</div>
            )}
            <div>
              <h3>{data.business?.business_name || "Water Billing"}</h3>
              {data.business?.legal_name ? <p>{data.business.legal_name}</p> : null}
              {data.business?.physical_address ? <p>{data.business.physical_address}</p> : null}
              <p>{[data.business?.phone, data.business?.email].filter(Boolean).join(" | ")}</p>
              {data.business?.tax_pin ? <p>PIN: {data.business.tax_pin}</p> : null}
            </div>
          </div>

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
            <button type="button" onClick={printDocument}>
              <Printer size={17} />
              Print receipt
            </button>
            <button type="button" onClick={() => setSelectedReceipt(null)} title="Close receipt">
              <X size={17} />
              Close
            </button>
          </div>

          <div className="receipt-header">
            {data.business?.logo_url ? (
              <img className="receipt-logo" src={assetUrl(data.business.logo_url)} alt="Business logo" />
            ) : (
              <div className="receipt-logo-mark">{data.business?.business_name?.slice(0, 2) || "AG"}</div>
            )}
            <div>
              <h3>{data.business?.business_name || "Water Billing"}</h3>
              {data.business?.legal_name ? <p>{data.business.legal_name}</p> : null}
              {data.business?.physical_address ? <p>{data.business.physical_address}</p> : null}
              <p>{[data.business?.phone, data.business?.email].filter(Boolean).join(" | ")}</p>
              {data.business?.tax_pin ? <p>PIN: {data.business.tax_pin}</p> : null}
            </div>
          </div>

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
