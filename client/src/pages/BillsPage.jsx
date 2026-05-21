import { CheckCircle2, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import AuditPanel from "../components/AuditPanel";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { api, assetUrl } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? new Date(value).toLocaleDateString() : "-");
const label = (value) => String(value || "").replace(/_/g, " ");
const billBalance = (bill) =>
  Number(bill?.balance_amount ?? Number(bill?.total_amount || bill?.amount || 0) - Number(bill?.paid_amount || 0));

function BillsPage({ user }) {
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("");
  const [selectedBill, setSelectedBill] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [message, setMessage] = useState("");
  const canManage = ["admin", "accountant"].includes(user.role);

  const load = () => api.bills.list(status).then(setBills);

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, [status]);

  const markPaid = async (id) => {
    const bill = bills.find((row) => row.id === id);
    const restrictedPeriod = ["closed", "locked"].includes(bill?.billing_period_status);
    const correctionReason = restrictedPeriod
      ? window.prompt(`Reason required to update a ${bill.billing_period_status} period bill:`)
      : "";
    if (restrictedPeriod && !correctionReason) return;
    await api.bills.markStatus(id, "paid", correctionReason || "");
    await load();
  };

  const openBillPrint = async (id) => {
    setMessage("");
    try {
      const [bill, settings] = await Promise.all([
        api.bills.get(id),
        canManage ? api.businessSettings.get().catch(() => null) : Promise.resolve(null)
      ]);
      setSelectedBill(bill);
      setBusinessSettings(settings);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const printBill = () => {
    if (!selectedBill) return;
    window.print();
  };
  const billTable = useTableControls(bills, {
    searchFields: ["customer_name", "acc_number", "billing_period_name", "billing_month", "bill_number", "status"]
  });
  const exportBills = () => {
    downloadCsvRows(
      "bills.csv",
      [
        { header: "Bill", value: (row) => row.bill_number },
        { header: "Customer", value: (row) => row.customer_name },
        { header: "Account", value: (row) => row.acc_number },
        { header: "Period", value: (row) => row.billing_period_name || row.billing_month },
        { header: "Due Date", value: (row) => row.due_date },
        { header: "Units", value: (row) => row.units_used },
        { header: "Total", value: (row) => row.total_amount || row.amount },
        { header: "Paid", value: (row) => row.paid_amount },
        { header: "Balance", value: (row) => billBalance(row) },
        { header: "Status", value: (row) => row.status }
      ],
      billTable.filteredRows
    );
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Bills</h2>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </header>

      {message ? <p className="form-note">{message}</p> : null}
      <div className="panel">
        <div className="panel-heading">
          <h3>Bill Register</h3>
          <button type="button" onClick={exportBills}>
            Export
          </button>
        </div>
        <TableControls table={billTable} label="bills" placeholder="Search bills" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Period</th>
                <th>Due</th>
                <th>Units</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {billTable.visibleRows.map((bill) => (
                <tr key={bill.id}>
                  <td>
                    <strong>{bill.customer_name}</strong>
                    <small>{bill.acc_number}</small>
                  </td>
                  <td>
                    <strong>{bill.billing_period_name || bill.billing_month?.slice(0, 10)}</strong>
                    <small>
                      {bill.bill_number || "-"}
                      {bill.billing_period_status ? ` | ${bill.billing_period_status}` : ""}
                    </small>
                  </td>
                  <td>{bill.due_date?.slice(0, 10) || "-"}</td>
                  <td>{Number(bill.units_used).toLocaleString()}</td>
                  <td>{Number(bill.rate).toLocaleString()}</td>
                  <td>{money(bill.total_amount || bill.amount)}</td>
                  <td>{money(bill.paid_amount)}</td>
                  <td>{money(billBalance(bill))}</td>
                  <td>
                    <StatusBadge status={bill.status} />
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={() => openBillPrint(bill.id)}>
                      <Printer size={15} />
                      Print
                    </button>
                    {canManage && bill.status !== "paid" ? (
                      <button type="button" onClick={() => markPaid(bill.id)}>
                        <CheckCircle2 size={15} />
                        Mark paid
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedBill ? (
        <div className="panel print-surface receipt-print">
          <div className="receipt-actions screen-only">
            <button type="button" onClick={printBill}>
              <Printer size={17} />
              Print bill
            </button>
            <button type="button" onClick={() => setSelectedBill(null)} title="Close bill">
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
              <p>{[businessSettings?.phone, businessSettings?.email].filter(Boolean).join(" | ")}</p>
              {businessSettings?.tax_pin ? <p>PIN: {businessSettings.tax_pin}</p> : null}
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
              <strong>{selectedBill.customer_name}</strong>
              <small>{selectedBill.acc_number}</small>
            </div>
            <div>
              <span>Phone</span>
              <strong>{selectedBill.phone || "-"}</strong>
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
                <td>{Number(selectedBill.previous_reading || 0).toLocaleString()}</td>
                <td>{Number(selectedBill.current_reading || 0).toLocaleString()}</td>
                <td>{Number(selectedBill.units_used || 0).toLocaleString()}</td>
                <td>{money(selectedBill.rate)}</td>
                <td>{money(selectedBill.subtotal_amount || selectedBill.amount)}</td>
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
                <tr>
                  <td>Usage subtotal</td>
                  <td>{money(selectedBill.subtotal_amount || selectedBill.amount)}</td>
                </tr>
                <tr>
                  <td>Fixed charge</td>
                  <td>{money(selectedBill.fixed_charge_amount)}</td>
                </tr>
                <tr>
                  <td>Penalty</td>
                  <td>{money(selectedBill.penalty_amount)}</td>
                </tr>
                <tr>
                  <td>VAT</td>
                  <td>{money(selectedBill.vat_amount)}</td>
                </tr>
                <tr>
                  <td>Reconnection fee</td>
                  <td>{money(selectedBill.reconnection_fee_amount)}</td>
                </tr>
                <tr>
                  <td>Adjustment</td>
                  <td>{money(selectedBill.adjustment_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="receipt-total">
            <span>Total billed</span>
            <strong>{money(selectedBill.total_amount || selectedBill.amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Paid / credit applied</span>
            <strong>{money(selectedBill.paid_amount)}</strong>
          </div>
          <div className="receipt-total muted-total">
            <span>Amount due</span>
            <strong>{money(billBalance(selectedBill))}</strong>
          </div>

          <div className="receipt-footer">
            {businessSettings?.paybill_number ? <p>Paybill: {businessSettings.paybill_number}</p> : null}
            {businessSettings?.till_number ? <p>Till: {businessSettings.till_number}</p> : null}
            {businessSettings?.receipt_footer_note ? <p>{businessSettings.receipt_footer_note}</p> : null}
            <small>{businessSettings?.business_name || "Water Billing"} customer bill</small>
          </div>
          <AuditPanel entityType="bill" entityId={selectedBill.id} title="Bill Audit" />
        </div>
      ) : null}
    </section>
  );
}

export default BillsPage;
