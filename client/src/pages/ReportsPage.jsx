import { Download, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import StatCard from "../components/StatCard";
import TableControls, { useTableControls } from "../components/TableControls";
import { api, assetUrl } from "../services/api";
import { downloadJson } from "../utils/csvTemplate";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const percent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;

const localDateInput = (dateValue = new Date()) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultFilters = () => {
  const today = new Date();
  return {
    start_date: localDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: localDateInput(today)
  };
};

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

const managementReportTitles = {
  all: "Management Reports",
  billingSummary: "Billing Summary",
  agingAnalysis: "Aging Analysis",
  customerBalances: "Customer Balances",
  maintenanceStatus: "Maintenance Status",
  maintenanceCategory: "Maintenance By Category",
  maintenanceZone: "Maintenance By Zone",
  maintenanceAssignee: "Maintenance Assignment",
  maintenanceRegister: "Maintenance Register"
};

const accountantReportTitles = {
  all: "Accountant Report",
  profitLoss: "Profit And Loss",
  cashProfitLoss: "Cash Basis Profit And Loss",
  accrualProfitLoss: "Accrual Basis Profit And Loss",
  billingStatus: "Billing By Status",
  collectionsChannel: "Collections By Channel",
  billingZone: "Billing By Zone",
  billingRegister: "Billing Register",
  receiptRegister: "Receipt Register",
  allocationLedger: "Payment Allocation Ledger",
  agingDetail: "Receivables Aging Detail",
  depositRegister: "Deposit Register",
  expensesCategory: "Expenses By Category",
  expenseRegister: "Expense Register"
};

const dataQualityRecordColumns = {
  duplicate_open_payable_bills: [
    ["Account", (row) => row.acc_number],
    ["Customer", (row) => row.customer_name],
    ["Period", (row) => row.billing_period],
    ["Bills", (row) => number(row.bill_count)],
    ["Balance", (row) => money(row.balance_amount)],
    ["Affected Bills", (row) => row.affected_bills]
  ],
  future_dated_operational_records: [
    ["Record", (row) => label(row.record_type)],
    ["ID", (row) => row.id],
    ["Date", (row) => date(row.record_date)],
    ["Owner/Ref", (row) => row.owner || "-"],
    ["Notes", (row) => row.notes || "-"]
  ]
};

function ReportsPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [data, setData] = useState(null);
  const [accountantData, setAccountantData] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [printScope, setPrintScope] = useState("accountant");
  const [printTarget, setPrintTarget] = useState("all");
  const [filters, setFilters] = useState(defaultFilters);
  const [message, setMessage] = useState("");
  const [accountantMessage, setAccountantMessage] = useState("");
  const [printAllRows, setPrintAllRows] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [dataQuality, setDataQuality] = useState([]);
  const [selectedQualityKey, setSelectedQualityKey] = useState("");

  useEffect(() => {
    api.reports.summary().then(setData).catch((err) => setMessage(err.message));
    api.reports.dataQuality().then(setDataQuality).catch(() => {});
    api.businessSettings.get().then(setBusinessSettings).catch(() => {});
  }, []);

  const loadAccountantReports = (nextFilters = filters) => {
    setAccountantMessage("");
    return api.reports
      .accountant(nextFilters)
      .then(setAccountantData)
      .catch((err) => setAccountantMessage(err.message));
  };

  useEffect(() => {
    loadAccountantReports(defaultFilters());
  }, []);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      billed: data.billingSummary.reduce((sum, row) => sum + Number(row.billed_amount || 0), 0),
      collected: data.collectionsSummary.reduce((sum, row) => sum + Number(row.received_amount || 0), 0),
      arrears: data.agingSummary.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0),
      openCustomers: data.customerBalances.length,
      maintenanceActive: Number(data.maintenanceTotals?.active_count || 0),
      maintenanceUrgent: Number(data.maintenanceTotals?.urgent_count || 0),
      maintenanceOverdue: Number(data.maintenanceTotals?.overdue_count || 0),
      maintenanceResolved30d: Number(data.maintenanceTotals?.resolved_30d || 0)
    };
  }, [data]);

  const accountantTotals = useMemo(() => {
    if (!accountantData) return null;
    return {
      billed: Number(accountantData.billingTotals?.billed_amount || 0),
      collected: accountantData.collectionsByChannel.reduce(
        (sum, row) => sum + Number(row.received_amount || 0),
        0
      ),
      outstanding: Number(accountantData.billingTotals?.balance_amount || 0),
      expenses: Number(accountantData.expenseTotals?.expense_amount || 0),
      deposits: accountantData.depositRegister.reduce((sum, row) => sum + Number(row.deposit_amount || 0), 0)
    };
  }, [accountantData]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    loadAccountantReports(filters);
  };

  const printReport = (scope, target = "all") => {
    flushSync(() => {
      setPrintScope(scope);
      setPrintTarget(target);
      setPrintAllRows(true);
    });
    window.print();
    setPrintAllRows(false);
  };

  const downloadBackupPack = async () => {
    setBackupMessage("");
    setBackupLoading(true);
    try {
      const backup = await api.reports.backup();
      const datasetCount = Object.keys(backup.dataset_counts || {}).length;
      downloadJson(`agua-operational-backup-${localDateInput()}.json`, backup);
      setBackupMessage(`Backup downloaded with ${number(datasetCount)} datasets.`);
    } catch (err) {
      setBackupMessage(err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const managementPrintTitle = managementReportTitles[printScope === "management" ? printTarget : "all"] || "Management Reports";
  const accountantPrintTitle = accountantReportTitles[printScope === "accountant" ? printTarget : "all"] || "Accountant Report";
  const maintenanceRegisterTable = useTableControls(data?.maintenanceRegister || [], {
    searchFields: ["request_number", "title", "customer_name", "acc_number", "zone_name", "category", "priority", "status", "assigned_to_name"]
  });
  const customerBalanceTable = useTableControls(data?.customerBalances || [], {
    searchFields: ["name", "acc_number", "zone_name", "open_bills", "oldest_due_date", "balance_due"]
  });
  const billingRegisterTable = useTableControls(accountantData?.billingRegister || [], {
    searchFields: ["bill_number", "billing_period_name", "billing_month", "customer_name", "acc_number", "zone_name", "balance_amount"]
  });
  const focusKey = navigationIntent?.page === "reports" ? navigationIntent.focus : "";
  const dataQualityFocusKeys = ["duplicate_open_payable_bills", "future_dated_operational_records"];
  const hasDataQualityFocus = dataQualityFocusKeys.includes(focusKey);
  const visibleDataQuality = hasDataQualityFocus
    ? dataQuality.filter((check) => check.key === focusKey)
    : dataQuality;
  const focusedQualityLabel = visibleDataQuality[0]?.label || navigationIntent?.label || "Data quality finding";
  useEffect(() => {
    if (hasDataQualityFocus) {
      setSelectedQualityKey(focusKey);
    }
  }, [focusKey, hasDataQualityFocus]);
  const selectedQuality =
    dataQuality.find((check) => check.key === selectedQualityKey) ||
    visibleDataQuality.find((check) => Number(check.count || 0) > 0 && check.records?.length) ||
    null;
  const selectedQualityRecords = selectedQuality?.records || [];
  const selectedQualityColumns = dataQualityRecordColumns[selectedQuality?.key] || [];
  const receiptRegisterTable = useTableControls(accountantData?.receiptRegister || [], {
    searchFields: ["receipt_number", "payment_date", "customer_name", "acc_number", "payment_channel", "external_reference", "recorded_by_name"]
  });
  const allocationLedgerTable = useTableControls(accountantData?.allocationLedger || [], {
    searchFields: ["receipt_number", "payment_date", "customer_name", "acc_number", "bill_number", "billing_month", "payment_channel"]
  });
  const receivablesAgingTable = useTableControls(accountantData?.receivablesAging || [], {
    searchFields: ["customer_name", "acc_number", "zone_name", "bill_number", "billing_month", "due_date", "aging_bucket"]
  });
  const depositRegisterTable = useTableControls(accountantData?.depositRegister || [], {
    searchFields: ["customer_name", "acc_number", "zone_name", "deposit_amount", "deposit_paid", "deposit_paid_at"]
  });
  const expenseRegisterTable = useTableControls(accountantData?.expenseRegister || [], {
    searchFields: ["expense_date", "category", "vendor", "description", "payment_channel", "reference", "receipt_number", "recorded_by_name", "amount"]
  });
  const maintenanceRegisterRows = printAllRows ? maintenanceRegisterTable.filteredRows : maintenanceRegisterTable.visibleRows;
  const customerBalanceRows = printAllRows ? customerBalanceTable.filteredRows : customerBalanceTable.visibleRows;
  const billingRegisterRows = printAllRows ? billingRegisterTable.filteredRows : billingRegisterTable.visibleRows;
  const receiptRegisterRows = printAllRows ? receiptRegisterTable.filteredRows : receiptRegisterTable.visibleRows;
  const allocationLedgerRows = printAllRows ? allocationLedgerTable.filteredRows : allocationLedgerTable.visibleRows;
  const receivablesAgingRows = printAllRows ? receivablesAgingTable.filteredRows : receivablesAgingTable.visibleRows;
  const depositRegisterRows = printAllRows ? depositRegisterTable.filteredRows : depositRegisterTable.visibleRows;
  const expenseRegisterRows = printAllRows ? expenseRegisterTable.filteredRows : expenseRegisterTable.visibleRows;
  const profitAndLoss = accountantData?.profitAndLoss || {};
  const cashProfit = profitAndLoss.cash || { revenue_lines: [], expense_lines: [], notes: [], totals: {} };
  const accrualProfit = profitAndLoss.accrual || { revenue_lines: [], expense_lines: [], notes: [], totals: {} };
  const renderProfitStatement = (statement, title, variant) => (
    <div className={`panel profit-loss-statement profit-loss-statement-${variant}`}>
      <div className="panel-heading compact-heading">
        <h3>{title}</h3>
        <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", `${variant}ProfitLoss`)} title={`Print ${title.toLowerCase()}`}>
          <Printer size={17} />
        </button>
      </div>
      <div className="reading-context">
        <div>
          <span>Revenue</span>
          <strong>{money(statement.totals?.revenue)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong>{money(statement.totals?.expenses)}</strong>
        </div>
        <div>
          <span>Net profit</span>
          <strong>{money(statement.totals?.net_profit)}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>{percent(statement.totals?.margin)}</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="muted-total">
              <td colSpan="2">Revenue</td>
            </tr>
            {statement.revenue_lines?.map((row) => (
              <tr key={`revenue-${title}-${row.label}`}>
                <td>
                  {row.label}
                  {row.detail ? <small>{row.detail}</small> : null}
                </td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
            <tr className="muted-total">
              <td colSpan="2">Expenses</td>
            </tr>
            {statement.expense_lines?.length ? (
              statement.expense_lines.map((row) => (
                <tr key={`expense-${title}-${row.label}`}>
                  <td>
                    {row.label}
                    {row.detail ? <small>{row.detail}</small> : null}
                  </td>
                  <td>{money(row.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>No expenses recorded</td>
                <td>{money(0)}</td>
              </tr>
            )}
            {statement.notes?.length ? (
              <>
                <tr className="muted-total">
                  <td colSpan="2">Notes</td>
                </tr>
                {statement.notes.map((row) => (
                  <tr key={`note-${title}-${row.label}`}>
                    <td>
                      {row.label}
                      {row.detail ? <small>{row.detail}</small> : null}
                    </td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (message) return <p className="form-error">{message}</p>;
  if (!data || !totals) return <p className="muted">Loading reports...</p>;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Management</p>
          <h2>Reports</h2>
        </div>
        <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "all")} title="Print management reports">
          <Printer size={18} />
        </button>
      </header>

      {user?.role === "admin" ? (
        <div className="panel screen-only">
          <div className="panel-heading">
            <h3>Backup Pack</h3>
            <button type="button" onClick={downloadBackupPack} disabled={backupLoading}>
              <Download size={17} />
              {backupLoading ? "Preparing..." : "Download backup"}
            </button>
          </div>
          <p className="muted">Server-generated operational export. Password hashes and reset tokens are excluded.</p>
          {backupMessage ? <p className="form-note">{backupMessage}</p> : null}
        </div>
      ) : null}

      {hasDataQualityFocus ? (
        <FocusNotice
          title={focusedQualityLabel}
          detail="Showing the data-quality check that needs review. Clear focus to return to all report checks."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <div className="panel screen-only">
        <div className="panel-heading">
          <h3>Data Quality Checks</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Severity</th>
                <th>Count</th>
                <th>Detail</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleDataQuality.map((check) => (
                <tr className={selectedQuality?.key === check.key ? "selected-row" : ""} key={check.key}>
                  <td>{check.label}</td>
                  <td>{label(check.severity)}</td>
                  <td>{number(check.count)}</td>
                  <td>{check.detail}</td>
                  <td>
                    {check.records?.length ? (
                      <button type="button" onClick={() => setSelectedQualityKey(check.key)}>
                        Review
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleDataQuality.length ? (
                <tr>
                  <td colSpan="5" className="muted">
                    No checks available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {selectedQuality && selectedQualityColumns.length ? (
          <div className="quality-detail-panel">
            <div className="panel-heading compact-heading">
              <div>
                <h3>{selectedQuality.label}</h3>
                <small>
                  Showing up to {number(selectedQualityRecords.length)} affected records for review.
                </small>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {selectedQualityColumns.map(([column]) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedQualityRecords.length ? (
                    selectedQualityRecords.map((row, index) => (
                      <tr key={`${selectedQuality.key}-${row.id || index}-${index}`}>
                        {selectedQualityColumns.map(([column, value]) => (
                          <td key={column}>{value(row) || "-"}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={selectedQualityColumns.length} className="muted">
                        No affected records returned for this check.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className={`print-surface report-print report-print-management report-print-${printTarget} ${printScope === "management" ? "active-print-surface" : ""}`}>
        <div className="report-print-header">
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
          <div className="report-print-meta">
            <span>{managementPrintTitle}</span>
            <strong>As at {date(new Date().toISOString())}</strong>
            <small>Printed {date(new Date().toISOString())}</small>
          </div>
        </div>

        <div className="stat-grid report-summary-section">
          <StatCard label="Billed" value={money(totals.billed)} detail="Last 12 billing periods" />
          <StatCard label="Collected" value={money(totals.collected)} detail="Recent posted receipts" />
          <StatCard label="Outstanding" value={money(totals.arrears)} detail="Open balances" />
          <StatCard label="Customers owing" value={number(totals.openCustomers)} detail="Accounts with arrears" />
          <StatCard label="Maintenance active" value={number(totals.maintenanceActive)} detail="Open and in progress" />
          <StatCard label="Maintenance urgent" value={number(totals.maintenanceUrgent)} detail="Active urgent requests" />
          <StatCard label="Maintenance overdue" value={number(totals.maintenanceOverdue)} detail="Past target date" />
          <StatCard label="Resolved 30d" value={number(totals.maintenanceResolved30d)} detail="Closed recently" />
        </div>

      <section className="report-grid">
        <div className="panel management-section management-section-billingSummary">
          <div className="panel-heading">
            <h3>Billing Summary</h3>
            <div className="row-actions">
              <FileSpreadsheet size={18} />
              <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "billingSummary")} title="Print billing summary">
                <Printer size={17} />
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Bills</th>
                  <th>Units</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.billingSummary.map((row) => (
                  <tr key={row.period_start}>
                    <td>{row.period_name}</td>
                    <td>{number(row.bill_count)}</td>
                    <td>{number(row.units_billed)}</td>
                    <td>{money(row.billed_amount)}</td>
                    <td>{money(row.paid_amount)}</td>
                    <td>{money(row.balance_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section management-section-agingAnalysis">
          <div className="panel-heading">
            <h3>Aging Analysis</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "agingAnalysis")} title="Print aging analysis">
              <Printer size={17} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Bills</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.agingSummary.map((row) => (
                  <tr key={row.bucket}>
                    <td>{row.bucket}</td>
                    <td>{number(row.bill_count)}</td>
                    <td>{money(row.balance_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section">
          <div className="panel-heading">
            <h3>Collections</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Channel</th>
                  <th>Receipts</th>
                  <th>Received</th>
                  <th>Allocated</th>
                </tr>
              </thead>
              <tbody>
                {data.collectionsSummary.map((row) => (
                  <tr key={`${row.payment_date}-${row.payment_channel}`}>
                    <td>{date(row.payment_date)}</td>
                    <td>{row.payment_channel}</td>
                    <td>{number(row.receipt_count)}</td>
                    <td>{money(row.received_amount)}</td>
                    <td>{money(row.allocated_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section">
          <div className="panel-heading">
            <h3>Route Reading Summary</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Customers</th>
                  <th>With Readings</th>
                  <th>Missing</th>
                  <th>Latest Reading</th>
                </tr>
              </thead>
              <tbody>
                {data.zoneReadingSummary.map((row) => (
                  <tr key={row.zone_id}>
                    <td>{row.zone_name}</td>
                    <td>{number(row.customer_count)}</td>
                    <td>{number(row.customers_with_readings)}</td>
                    <td>{number(row.customers_without_readings)}</td>
                    <td>{date(row.latest_reading_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section management-section-maintenanceStatus">
          <div className="panel-heading">
            <h3>Maintenance Status</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "maintenanceStatus")} title="Print maintenance status">
              <Printer size={17} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requests</th>
                  <th>Urgent</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByStatus?.length ? (
                  data.maintenanceByStatus.map((row) => (
                    <tr key={row.status}>
                      <td>{label(row.status)}</td>
                      <td>{number(row.request_count)}</td>
                      <td>{number(row.urgent_count)}</td>
                      <td>{number(row.overdue_count)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={4} />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section management-section-maintenanceCategory">
          <div className="panel-heading">
            <h3>Maintenance By Category</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "maintenanceCategory")} title="Print maintenance by category">
              <Printer size={17} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Active</th>
                  <th>Urgent</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByCategory?.length ? (
                  data.maintenanceByCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{label(row.category)}</td>
                      <td>{number(row.request_count)}</td>
                      <td>{number(row.urgent_count)}</td>
                      <td>{number(row.overdue_count)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={4} />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section management-section-maintenanceZone">
          <div className="panel-heading">
            <h3>Maintenance By Zone</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "maintenanceZone")} title="Print maintenance by zone">
              <Printer size={17} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Active</th>
                  <th>Urgent</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByZone?.length ? (
                  data.maintenanceByZone.map((row) => (
                    <tr key={row.zone_name}>
                      <td>{row.zone_name}</td>
                      <td>{number(row.request_count)}</td>
                      <td>{number(row.urgent_count)}</td>
                      <td>{number(row.overdue_count)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={4} />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel management-section management-section-maintenanceAssignee">
          <div className="panel-heading">
            <h3>Maintenance Assignment</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "maintenanceAssignee")} title="Print maintenance assignment">
              <Printer size={17} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assigned To</th>
                  <th>Active</th>
                  <th>Open</th>
                  <th>In Progress</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByAssignee?.length ? (
                  data.maintenanceByAssignee.map((row) => (
                    <tr key={row.assigned_to_name}>
                      <td>{row.assigned_to_name}</td>
                      <td>{number(row.request_count)}</td>
                      <td>{number(row.open_count)}</td>
                      <td>{number(row.in_progress_count)}</td>
                      <td>{number(row.overdue_count)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={5} />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel full-span management-section management-section-maintenanceRegister">
          <div className="panel-heading">
            <h3>Maintenance Register</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "maintenanceRegister")} title="Print maintenance register">
              <Printer size={17} />
            </button>
          </div>
          <TableControls table={maintenanceRegisterTable} label="requests" placeholder="Search maintenance" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Zone</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceRegisterTable.total ? (
                  maintenanceRegisterRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.request_number || `MR-${row.id}`}
                        <small>{row.title}</small>
                        <small>Reported {date(row.reported_at)}</small>
                      </td>
                      <td>
                        {row.customer_name || "General"}
                        <small>{row.acc_number || "-"}</small>
                      </td>
                      <td>{row.zone_name || "-"}</td>
                      <td>{label(row.category)}</td>
                      <td>{label(row.priority)}</td>
                      <td>{label(row.status)}</td>
                      <td>{row.assigned_to_name || "Unassigned"}</td>
                      <td>{date(row.target_date)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={8} />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel full-span management-section management-section-customerBalances">
          <div className="panel-heading">
            <h3>Customer Balances</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "customerBalances")} title="Print customer balances">
              <Printer size={17} />
            </button>
          </div>
          <TableControls table={customerBalanceTable} label="customers" placeholder="Search balances" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Account</th>
                  <th>Zone</th>
                  <th>Open Bills</th>
                  <th>Oldest Due</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {customerBalanceTable.total ? (
                  customerBalanceRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.acc_number}</td>
                      <td>{row.zone_name}</td>
                      <td>{number(row.open_bills)}</td>
                      <td>{date(row.oldest_due_date)}</td>
                      <td>{money(row.balance_due)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={6} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
        <div className="report-print-footer">
          {businessSettings?.report_footer_note ? <p>{businessSettings.report_footer_note}</p> : null}
          <small>{businessSettings?.business_name || "Water Billing"} management reports</small>
        </div>
      </div>

      <section className="page-stack">
        <header className="page-header">
          <div>
            <p className="eyebrow">Accountant</p>
            <h2>Accounting Reports</h2>
          </div>
          <form className="filter-bar" onSubmit={handleFilterSubmit}>
            <label>
              From
              <input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} />
            </label>
            <label>
              To
              <input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} />
            </label>
            <button className="icon-button" type="submit" title="Refresh reports">
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" type="button" onClick={() => printReport("accountant", "all")} title="Print accountant reports">
              <Printer size={18} />
            </button>
          </form>
        </header>

        {accountantMessage && <p className="form-error">{accountantMessage}</p>}
        {!accountantData || !accountantTotals ? (
          <p className="muted">Loading accounting reports...</p>
        ) : (
          <div className={`print-surface report-print report-print-accountant report-print-${printTarget} ${printScope === "accountant" ? "active-print-surface" : ""}`}>
            <div className="report-print-header">
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
              <div className="report-print-meta">
                <span>{accountantPrintTitle}</span>
                <strong>{date(accountantData.reportPeriod.start_date)} to {date(accountantData.reportPeriod.end_date)}</strong>
                <small>Printed {date(new Date().toISOString())}</small>
              </div>
            </div>

            <div className="stat-grid report-summary-section">
              <StatCard label="Period billed" value={money(accountantTotals.billed)} detail="Billing register total" />
              <StatCard label="Period collected" value={money(accountantTotals.collected)} detail="Posted receipts" />
              <StatCard label="Period balance" value={money(accountantTotals.outstanding)} detail="Bill balances" />
              <StatCard label="Period expenses" value={money(accountantTotals.expenses)} detail="Operating costs" />
              <StatCard label="Cash net profit" value={money(cashProfit.totals?.net_profit)} detail={`Margin ${percent(cashProfit.totals?.margin)}`} />
              <StatCard label="Accrual net profit" value={money(accrualProfit.totals?.net_profit)} detail={`Margin ${percent(accrualProfit.totals?.margin)}`} />
            </div>

            <section className="report-grid">
              <div className="full-span report-section report-section-profitLoss">
                <div className="panel-heading">
                  <h3>Profit And Loss</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "profitLoss")} title="Print profit and loss">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="profit-loss-grid">
                  {renderProfitStatement(cashProfit, "Cash Basis", "cash")}
                  {renderProfitStatement(accrualProfit, "Accrual Basis", "accrual")}
                </div>
              </div>

              <div className="panel report-section report-section-billingStatus">
                <div className="panel-heading">
                  <h3>Billing By Status</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "billingStatus")} title="Print billing by status">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Bills</th>
                        <th>Billed</th>
                        <th>Paid</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountantData.billingByStatus.length ? (
                        accountantData.billingByStatus.map((row) => (
                          <tr key={row.status}>
                            <td>{label(row.status)}</td>
                            <td>{number(row.bill_count)}</td>
                            <td>{money(row.billed_amount)}</td>
                            <td>{money(row.paid_amount)}</td>
                            <td>{money(row.balance_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={5} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel report-section report-section-collectionsChannel">
                <div className="panel-heading">
                  <h3>Collections By Channel</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "collectionsChannel")} title="Print collections by channel">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Receipts</th>
                        <th>Received</th>
                        <th>Allocated</th>
                        <th>Unallocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountantData.collectionsByChannel.length ? (
                        accountantData.collectionsByChannel.map((row) => (
                          <tr key={row.payment_channel}>
                            <td>{label(row.payment_channel)}</td>
                            <td>{number(row.receipt_count)}</td>
                            <td>{money(row.received_amount)}</td>
                            <td>{money(row.allocated_amount)}</td>
                            <td>{money(row.unallocated_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={5} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-billingZone">
                <div className="panel-heading">
                  <h3>Billing By Zone</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "billingZone")} title="Print billing by zone">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th>Bills</th>
                        <th>Units</th>
                        <th>Billed</th>
                        <th>Paid</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountantData.billingByZone.length ? (
                        accountantData.billingByZone.map((row) => (
                          <tr key={row.zone_id}>
                            <td>{row.zone_name}</td>
                            <td>{number(row.bill_count)}</td>
                            <td>{number(row.units_billed)}</td>
                            <td>{money(row.billed_amount)}</td>
                            <td>{money(row.paid_amount)}</td>
                            <td>{money(row.balance_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={6} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-billingRegister">
                <div className="panel-heading">
                  <h3>Billing Register</h3>
                  <div className="row-actions">
                    <FileSpreadsheet size={18} />
                    <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "billingRegister")} title="Print billing register">
                      <Printer size={17} />
                    </button>
                  </div>
                </div>
                <TableControls table={billingRegisterTable} label="bills" placeholder="Search billing register" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bill</th>
                        <th>Period</th>
                        <th>Customer</th>
                        <th>Zone</th>
                        <th>Units</th>
                        <th>Rate</th>
                        <th>Subtotal</th>
                        <th>Fixed</th>
                        <th>Penalty</th>
                        <th>VAT</th>
                        <th>Adjustment</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingRegisterTable.total ? (
                        billingRegisterRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.bill_number || `Bill ${row.id}`}
                              <small>{date(row.due_date)}</small>
                            </td>
                            <td>{row.billing_period_name || date(row.billing_month)}</td>
                            <td>
                              {row.customer_name}
                              <small>{row.acc_number}</small>
                            </td>
                            <td>{row.zone_name}</td>
                            <td>{number(row.units_used)}</td>
                            <td>{money(row.rate)}</td>
                            <td>{money(row.subtotal_amount)}</td>
                            <td>{money(row.fixed_charge_amount)}</td>
                            <td>{money(row.penalty_amount)}</td>
                            <td>{money(row.vat_amount)}</td>
                            <td>{money(row.adjustment_amount)}</td>
                            <td>{money(row.billed_amount)}</td>
                            <td>{money(row.paid_amount)}</td>
                            <td>{money(row.balance_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={14} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-receiptRegister">
                <div className="panel-heading">
                  <h3>Receipt Register</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "receiptRegister")} title="Print receipt register">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={receiptRegisterTable} label="receipts" placeholder="Search receipts" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Channel</th>
                        <th>Reference</th>
                        <th>Received</th>
                        <th>Allocated</th>
                        <th>Recorded By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptRegisterTable.total ? (
                        receiptRegisterRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.receipt_number}</td>
                            <td>{date(row.payment_date)}</td>
                            <td>
                              {row.customer_name}
                              <small>{row.acc_number}</small>
                            </td>
                            <td>{label(row.payment_channel)}</td>
                            <td>{row.external_reference || "-"}</td>
                            <td>{money(row.amount)}</td>
                            <td>{money(row.total_allocated_amount)}</td>
                            <td>{row.recorded_by_name || "-"}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={8} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-allocationLedger">
                <div className="panel-heading">
                  <h3>Payment Allocation Ledger</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "allocationLedger")} title="Print payment allocation ledger">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={allocationLedgerTable} label="allocations" placeholder="Search allocations" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Bill</th>
                        <th>Billing Month</th>
                        <th>Channel</th>
                        <th>Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationLedgerTable.total ? (
                        allocationLedgerRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.receipt_number}</td>
                            <td>{date(row.payment_date)}</td>
                            <td>
                              {row.customer_name}
                              <small>{row.acc_number}</small>
                            </td>
                            <td>{row.bill_number || "-"}</td>
                            <td>{date(row.billing_month)}</td>
                            <td>{label(row.payment_channel)}</td>
                            <td>{money(row.allocated_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={7} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-agingDetail">
                <div className="panel-heading">
                  <h3>Receivables Aging Detail</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "agingDetail")} title="Print aging detail">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={receivablesAgingTable} label="bills" placeholder="Search aging detail" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Zone</th>
                        <th>Bill</th>
                        <th>Billing Month</th>
                        <th>Due Date</th>
                        <th>Bucket</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivablesAgingTable.total ? (
                        receivablesAgingRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.customer_name}
                              <small>{row.acc_number}</small>
                            </td>
                            <td>{row.zone_name}</td>
                            <td>{row.bill_number || `Bill ${row.id}`}</td>
                            <td>{date(row.billing_month)}</td>
                            <td>{date(row.due_date)}</td>
                            <td>{row.aging_bucket}</td>
                            <td>{money(row.balance_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={7} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-depositRegister">
                <div className="panel-heading">
                  <h3>Deposit Register</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "depositRegister")} title="Print deposit register">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={depositRegisterTable} label="deposits" placeholder="Search deposits" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Zone</th>
                        <th>Deposit</th>
                        <th>Status</th>
                        <th>Paid On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositRegisterTable.total ? (
                        depositRegisterRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.customer_name}
                              <small>{row.acc_number}</small>
                            </td>
                            <td>{row.zone_name}</td>
                            <td>{money(row.deposit_amount)}</td>
                            <td>{row.deposit_paid ? "Paid" : "Unpaid"}</td>
                            <td>{date(row.deposit_paid_at)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={5} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel report-section report-section-expensesCategory">
                <div className="panel-heading">
                  <h3>Expenses By Category</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "expensesCategory")} title="Print expenses by category">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Entries</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountantData.expensesByCategory.length ? (
                        accountantData.expensesByCategory.map((row) => (
                          <tr key={row.category}>
                            <td>{row.category}</td>
                            <td>{number(row.expense_count)}</td>
                            <td>{money(row.expense_amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={3} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel full-span report-section report-section-expenseRegister">
                <div className="panel-heading">
                  <h3>Expense Register</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "expenseRegister")} title="Print expense register">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={expenseRegisterTable} label="expenses" placeholder="Search expense register" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Vendor</th>
                        <th>Description</th>
                        <th>Channel</th>
                        <th>Reference</th>
                        <th>Recorded By</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseRegisterTable.total ? (
                        expenseRegisterRows.map((row) => (
                          <tr key={row.id}>
                            <td>{date(row.expense_date)}</td>
                            <td>{row.category}</td>
                            <td>{row.vendor || "-"}</td>
                            <td>{row.description}</td>
                            <td>{label(row.payment_channel)}</td>
                            <td>{row.reference || row.receipt_number || "-"}</td>
                            <td>{row.recorded_by_name || "-"}</td>
                            <td>{money(row.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <EmptyRow colSpan={8} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <div className="report-print-footer">
              {businessSettings?.report_footer_note ? <p>{businessSettings.report_footer_note}</p> : null}
              <small>{businessSettings?.business_name || "Water Billing"} accountant report</small>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

export default ReportsPage;
