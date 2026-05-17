import { CircleDollarSign, Download, Eye, FileUp, Printer, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, assetUrl } from "../services/api";
import { downloadCsvTemplate } from "../utils/csvTemplate";

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

function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [csvText, setCsvText] = useState("acc_number,payment_date,amount,payment_channel,receipt_number,external_reference,received_from,notes\n");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
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
    const [paymentRows, customerRows, businessRow] = await Promise.all([
      api.payments.list(),
      api.customers.list(),
      api.businessSettings.get()
    ]);
    setPayments(paymentRows);
    setCustomers(customerRows);
    setBusinessSettings(businessRow);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
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

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cash Office</p>
          <h2>Payments</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="page-stack">
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

          <div className="panel form-grid">
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
                  <h3>{businessSettings?.business_name || "AGUA Global"}</h3>
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
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-heading">
              <h3>Payment History</h3>
            </div>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
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
                        <div className="row-actions">
                          <button type="button" onClick={() => openReceipt(payment)} disabled={loadingReceipt}>
                            Print
                          </button>
                          <button type="button" onClick={() => edit(payment)}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
