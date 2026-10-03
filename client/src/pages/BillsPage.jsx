import { CheckCircle2, Mail, MessageSquare, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AuditPanel from "../components/AuditPanel";
import DocumentPrintHeader from "../components/DocumentPrintHeader";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";
import { namedExport, withPrintTitle } from "../utils/exportNames";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? new Date(value).toLocaleDateString() : "-");
const label = (value) => String(value || "").replace(/_/g, " ");
const billBalance = (bill) =>
  Number(bill?.balance_amount ?? Number(bill?.total_amount || bill?.amount || 0) - Number(bill?.paid_amount || 0));
const nonZeroChargeRows = (bill) =>
  [
    ["Usage subtotal", bill?.subtotal_amount || bill?.amount],
    ["Fixed charge", bill?.fixed_charge_amount],
    ["Penalty", bill?.penalty_amount],
    ["VAT", bill?.vat_amount],
    ["Reconnection fee", bill?.reconnection_fee_amount],
    ["Adjustment", bill?.adjustment_amount]
  ].filter(([label, amount]) => label === "Usage subtotal" || Number(amount || 0) !== 0);

function BillsPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [bills, setBills] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [status, setStatus] = useState("");
  const [selectedBill, setSelectedBill] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [paidReviewBill, setPaidReviewBill] = useState(null);
  const [markPaidBusyId, setMarkPaidBusyId] = useState(null);
  const [, setMessage] = useToastMessage();
  const canManage = ["admin", "accountant"].includes(user.role);
  const initialFetch = useRef(true);

  const load = async ({ showInitialState = false } = {}) => {
    if (showInitialState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      setBills(await api.bills.list(status));
    } catch (err) {
      if (showInitialState) setInitialError(err.message || "Bill records could not be loaded.");
      throw err;
    } finally {
      if (showInitialState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    const showInitialState = initialFetch.current;
    initialFetch.current = false;
    load({ showInitialState }).catch((err) => {
      if (!showInitialState) setMessage(err.message);
    });
  }, [status]);

  useEffect(() => {
    if (navigationIntent?.page === "bills" && navigationIntent.focus === "held_bills") {
      setStatus("");
    }
  }, [navigationIntent]);

  const persistPaidStatus = async (bill, correctionReason = "") => {
    if (markPaidBusyId) return;
    setMessage("");
    setMarkPaidBusyId(bill.id);
    try {
      await api.bills.markStatus(bill.id, "paid", correctionReason || "");
      await load();
      setPaidReviewBill(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setMarkPaidBusyId(null);
    }
  };

  const markPaid = (id) => {
    if (markPaidBusyId) return;
    const bill = bills.find((row) => row.id === id);
    if (!bill) return;
    const restrictedPeriod = ["closed", "locked"].includes(bill?.billing_period_status);
    if (restrictedPeriod) {
      setPaidReviewBill(bill);
      return;
    }
    persistPaidStatus(bill);
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

  useEffect(() => {
    if (navigationIntent?.page !== "bills" || navigationIntent.focus !== "bill_detail" || !navigationIntent.bill_id) return;
    if (Number(selectedBill?.id) === Number(navigationIntent.bill_id)) return;
    openBillPrint(navigationIntent.bill_id);
  }, [navigationIntent, selectedBill]);

  const printBill = () => {
    if (!selectedBill) return;
    withPrintTitle(
      `bill ${selectedBill.bill_number || selectedBill.id} ${selectedBill.acc_number || selectedBill.customer_name || ""}`,
      () => window.print(),
      businessSettings
    );
  };
  const sendBillEmail = async (id) => {
    setMessage("");
    try {
      const result = await api.bills.sendEmail(id);
      setMessage(result.message || "Bill email request completed.");
      if (selectedBill?.id === id) {
        setSelectedBill(await api.bills.get(id));
      }
    } catch (err) {
      setMessage(err.message);
    }
  };
  const sendBillSms = async (id) => {
    setMessage("");
    try {
      const result = await api.bills.sendSms(id);
      setMessage(result.message || "Bill SMS request completed.");
      if (selectedBill?.id === id) {
        setSelectedBill(await api.bills.get(id));
      }
    } catch (err) {
      setMessage(err.message);
    }
  };
  const focusKey = navigationIntent?.page === "bills" ? navigationIntent.focus : "";
  const today = new Date().toISOString().slice(0, 10);
  const focusedBills = bills.filter((bill) => {
    if (focusKey === "held_bills") return bill.bill_pay_status === "held";
    if (focusKey === "overdue_bills") {
      return bill.bill_pay_status === "payable" && bill.status !== "paid" && bill.due_date?.slice(0, 10) < today;
    }
    return true;
  });
  const billTable = useTableControls(focusedBills, {
    searchFields: ["customer_name", "acc_number", "billing_period_name", "billing_month", "bill_number", "status", "bill_pay_status", "payability_reason"]
  });
  const exportBills = () => {
    downloadCsvRows(
      namedExport("bill-register", "csv", [status || "all-statuses", focusKey || "all-bills"]),
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
  const selectedTariff = selectedBill?.tariff_snapshot || {};
  const selectedTariffBlocks = Array.isArray(selectedTariff.blocks) ? selectedTariff.blocks : [];
  const selectedPenalties = selectedBill?.penalty_applications || [];
  const isServiceChargeBill = selectedBill?.bill_origin === "service_charge";
  const billSummary = useMemo(() => {
    const held = bills.filter((bill) => bill.bill_pay_status === "held");
    const overdue = bills.filter(
      (bill) => bill.bill_pay_status === "payable" && bill.status !== "paid" && bill.due_date?.slice(0, 10) < today
    );
    const payable = bills.filter((bill) => bill.bill_pay_status === "payable");
    return {
      issued: bills.reduce((sum, bill) => sum + Number(bill.total_amount || bill.amount || 0), 0),
      outstanding: bills.reduce((sum, bill) => sum + billBalance(bill), 0),
      payable: payable.length,
      overdue: overdue.length,
      overdueAmount: overdue.reduce((sum, bill) => sum + billBalance(bill), 0),
      held: held.length
    };
  }, [bills, today]);

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving issued bills, balances, and payment status." title="Preparing revenue register" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={() => load({ showInitialState: true }).catch(() => {})}
        state="error"
        title="Revenue register could not load"
      />
    );
  }

  return (
    <section className="page-stack bill-control-page">
      <header className="page-header bill-control-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Revenue register</h2>
          <p>Review issued bills, focus overdue balances, and keep delivery and payment status close to the receivable.</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </header>

      {focusKey === "held_bills" ? (
        <FocusNotice
          title="Held bills"
          detail="Showing bills generated but not yet payable. Clear focus to return to the full bill register."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "overdue_bills" ? (
        <FocusNotice
          title="Overdue receivables"
          detail="Showing payable unpaid bills past due date. Use this list to follow up customers or open a bill for printing and delivery."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "bill_detail" ? (
        <FocusNotice
          title="Bill review"
          detail="Showing the selected bill and its delivery history."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="bill-control-metrics" aria-label="Bill overview">
        <div>
          <span>Issued value</span>
          <strong>{money(billSummary.issued)}</strong>
          <small>{bills.length} bill{bills.length === 1 ? "" : "s"} in view</small>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{money(billSummary.outstanding)}</strong>
          <small>{billSummary.payable} payable bill{billSummary.payable === 1 ? "" : "s"}</small>
        </div>
        <div className={billSummary.overdue ? "needs-attention" : ""}>
          <span>Overdue exposure</span>
          <strong>{money(billSummary.overdueAmount)}</strong>
          <small>{billSummary.overdue} bill{billSummary.overdue === 1 ? "" : "s"} need follow-up</small>
        </div>
        <div className={billSummary.held ? "needs-attention" : ""}>
          <span>Held bills</span>
          <strong>{billSummary.held}</strong>
          <small>{billSummary.held ? "Resolve before collection" : "No blocked receivables"}</small>
        </div>
      </section>

      <div className="panel bill-register-panel">
        <div className="panel-heading">
          <h3>Bill Register</h3>
          <button type="button" onClick={exportBills}>
            Export
          </button>
        </div>
        <TableControls table={billTable} label="bills" placeholder="Search bills" />
        <div className="table-wrap">
          <table className="mobile-record-table bill-record-table">
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
              {billTable.visibleRows.length ? (
                billTable.visibleRows.map((bill) => (
                  <tr key={bill.id}>
                    <td className="mobile-record-primary" data-label="Customer">
                      <strong>{bill.customer_name}</strong>
                      <small>{bill.acc_number}</small>
                    </td>
                    <td data-label="Period">
                      <strong>{bill.billing_period_name || bill.billing_month?.slice(0, 10)}</strong>
                      <small>
                        {bill.bill_number || "-"}
                        {bill.billing_period_status ? ` | ${bill.billing_period_status}` : ""}
                      </small>
                    </td>
                    <td data-label="Due">{bill.due_date?.slice(0, 10) || "-"}</td>
                    <td data-label="Units">{Number(bill.units_used).toLocaleString()}</td>
                    <td data-label="Rate">{Number(bill.rate).toLocaleString()}</td>
                    <td data-label="Amount">{money(bill.total_amount || bill.amount)}</td>
                    <td data-label="Paid">{money(bill.paid_amount)}</td>
                    <td data-label="Balance">{money(billBalance(bill))}</td>
                    <td data-label="Status">
                      <StatusBadge status={bill.status} />
                    </td>
                    <td className="row-actions mobile-record-actions" data-label="Actions">
                      <button type="button" onClick={() => openBillPrint(bill.id)}>
                        <Printer size={15} />
                        Print
                      </button>
                      {canManage ? (
                        <button type="button" onClick={() => sendBillEmail(bill.id)}>
                          <Mail size={15} />
                          Email
                        </button>
                      ) : null}
                      {canManage ? (
                        <button type="button" onClick={() => sendBillSms(bill.id)}>
                          <MessageSquare size={15} />
                          SMS
                        </button>
                      ) : null}
                      {canManage && bill.status !== "paid" ? (
                        <button type="button" onClick={() => markPaid(bill.id)} disabled={Boolean(markPaidBusyId)}>
                          <CheckCircle2 size={15} />
                          {markPaidBusyId === bill.id ? "Updating..." : "Mark paid"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={10} title="No bills found" detail="Bills will appear here after readings are billed." />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedBill ? (
        <div className="panel print-surface receipt-print bill-print">
          <div className="receipt-actions screen-only">
            <button type="button" onClick={printBill}>
              <Printer size={17} />
              Print bill
            </button>
            {canManage ? (
              <button type="button" onClick={() => sendBillEmail(selectedBill.id)}>
                <Mail size={17} />
                Email bill
              </button>
            ) : null}
            {canManage ? (
              <button type="button" onClick={() => sendBillSms(selectedBill.id)}>
                <MessageSquare size={17} />
                SMS bill
              </button>
            ) : null}
            <button type="button" onClick={() => setSelectedBill(null)} title="Close bill">
              <X size={17} />
              Close
            </button>
          </div>

          <DocumentPrintHeader
            businessSettings={businessSettings}
            dateLabel={`Due ${date(selectedBill.due_date)}`}
            documentLabel={isServiceChargeBill ? "Service charge invoice" : "Customer bill"}
            documentNumber={selectedBill.bill_number || `Bill ${selectedBill.id}`}
          />

          <div className="receipt-title">
            <div>
              <span>{isServiceChargeBill ? "Service charge invoice" : "Bill"}</span>
              <strong>{selectedBill.bill_number || `Bill ${selectedBill.id}`}</strong>
            </div>
            <div>
              <span>Due Date</span>
              <strong>{date(selectedBill.due_date)}</strong>
            </div>
          </div>

          {isServiceChargeBill ? (
            <div className="receipt-info-grid">
              <div>
                <span>Customer</span>
                <strong>{selectedBill.customer_name}</strong>
                <small>{selectedBill.acc_number}</small>
              </div>
              <div>
                <span>Charge Type</span>
                <strong>{label(selectedBill.charge_type || "service_charge")}</strong>
                <small>{selectedBill.charge_number || "-"}</small>
              </div>
              <div>
                <span>Charge Date</span>
                <strong>{date(selectedBill.billing_month)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{label(selectedBill.status)}</strong>
              </div>
            </div>
          ) : (
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
          )}

          {isServiceChargeBill ? (
            <div className="table-wrap bill-service-charge-detail">
              <table>
                <thead>
                  <tr>
                    <th>Charge Type</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{label(selectedBill.charge_type || "service_charge")}</td>
                    <td>{selectedBill.service_charge_description || selectedBill.payability_reason || "Customer service charge"}</td>
                    <td>{money(selectedBill.total_amount || selectedBill.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <>
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
                {nonZeroChargeRows(selectedBill).map(([label, amount]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{money(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Calculation Basis</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tariff</td>
                  <td>
                    {selectedTariff.name || "-"}
                    <small>
                      {[
                        selectedTariff.effective_from ? `effective ${date(selectedTariff.effective_from)}` : null,
                        selectedTariff.version_id ? `version ${selectedTariff.version_id}` : null
                      ]
                        .filter(Boolean)
                        .join(" | ") || "-"}
                    </small>
                  </td>
                </tr>
                <tr>
                  <td>Tariff type</td>
                  <td>{label(selectedTariff.tariff_type || "flat")}</td>
                </tr>
                <tr>
                  <td>Usage formula</td>
                  <td>
                    {Number(selectedBill.units_used || 0).toLocaleString()} units x {money(selectedBill.rate)}
                    <small>Subtotal: {money(selectedBill.subtotal_amount || selectedBill.amount)}</small>
                  </td>
                </tr>
                {selectedTariffBlocks.length ? (
                  <tr>
                    <td>Block rows</td>
                    <td>
                      {selectedTariffBlocks
                        .map((block) => {
                          const from = Number(block.min_units || 0).toLocaleString();
                          const to = block.max_units === null || block.max_units === undefined ? "above" : Number(block.max_units).toLocaleString();
                          return `${from}-${to}: ${money(block.unit_rate)}`;
                        })
                        .join(" | ")}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td>Principal basis</td>
                  <td>
                    {money(selectedBill.subtotal_amount || selectedBill.amount)} usage + {money(selectedBill.fixed_charge_amount)} fixed
                    <small>Penalty and VAT are shown separately in the charge table.</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
            </>
          )}

          {selectedPenalties.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Penalty Month</th>
                    <th>Principal</th>
                    <th>Penalty</th>
                    <th>Status</th>
                    <th>Waiver</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPenalties.map((penalty) => (
                    <tr key={penalty.id}>
                      <td>{date(penalty.application_month)}</td>
                      <td>{money(penalty.principal_amount)}</td>
                      <td>{money(penalty.penalty_amount)}</td>
                      <td>{penalty.status}</td>
                      <td>
                        {penalty.waived_at ? date(penalty.waived_at) : "-"}
                        <small>{penalty.waiver_reason || penalty.waived_by_name || ""}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

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
            <small>{businessSettings?.business_name || "Water Billing"} {isServiceChargeBill ? "customer service charge invoice" : "customer bill"}</small>
          </div>
          <div className="screen-only">
            <div className="panel-heading compact-heading">
              <h3>Delivery History</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Sent By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBill.delivery_logs?.length ? (
                    selectedBill.delivery_logs.map((log) => (
                      <tr key={log.id}>
                        <td>{date(log.created_at)}</td>
                        <td>{log.channel}</td>
                        <td>
                          {log.recipient}
                          <small>{log.error_message || log.subject || ""}</small>
                        </td>
                        <td><span className={`status status-${log.status}`}>{log.status}</span></td>
                        <td>{log.sent_by_name || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={5} title="No delivery history" detail="Bill delivery attempts will appear here." />
                  )}
                </tbody>
              </table>
            </div>
            <AuditPanel entityType="bill" entityId={selectedBill.id} title="Bill Audit" />
          </div>
        </div>
      ) : null}

      <ReviewDialog
        open={Boolean(paidReviewBill)}
        eyebrow="Restricted period correction"
        title="Mark restricted-period bill as paid"
        description={
          paidReviewBill
            ? `${paidReviewBill.bill_number || `Bill ${paidReviewBill.id}`} for ${paidReviewBill.customer_name} belongs to a ${paidReviewBill.billing_period_status} billing period. Marking it paid requires an audit reason.`
            : ""
        }
        confirmLabel="Mark bill paid"
        cancelLabel="Keep current status"
        reasonLabel="Correction reason"
        reasonPlaceholder="Explain why this restricted-period bill must be marked paid"
        reasonRequired
        busy={markPaidBusyId === paidReviewBill?.id}
        busyLabel="Marking paid..."
        danger
        onCancel={() => !markPaidBusyId && setPaidReviewBill(null)}
        onConfirm={(reason) => persistPaidStatus(paidReviewBill, reason)}
      />
    </section>
  );
}

export default BillsPage;
