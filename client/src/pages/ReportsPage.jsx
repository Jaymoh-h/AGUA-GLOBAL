import { FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import StatCard from "../components/StatCard";
import TableControls, { useTableControls } from "../components/TableControls";
import { api, assetUrl } from "../services/api";
import { withPrintTitle } from "../utils/exportNames";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const percent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;
const sumRows = (rows, field) => rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0);
const countRows = (rows, field) => rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0);
const agingBucketFields = [
  "current_amount",
  "days_1_30_amount",
  "days_31_60_amount",
  "days_61_90_amount",
  "days_91_over_amount",
  "total_amount"
];

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
  collections: "Collections",
  routeSummary: "Route Reading Summary",
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
  expenseRegister: "Expense Register",
  contractorPayables: "Contractor Payables",
  contractorBalances: "Contractor Balances",
  contractorInvoiceRegister: "Contractor Invoice Register"
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

const reportSectionClass = (baseClass, isVisible) =>
  `${baseClass} ${isVisible ? "" : "report-section-collapsed"}`;

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
  const [dataQuality, setDataQuality] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [monitoringAlertSnapshot, setMonitoringAlertSnapshot] = useState(null);
  const [selectedQualityKey, setSelectedQualityKey] = useState("");
  const [activeManagementReport, setActiveManagementReport] = useState("billingSummary");
  const [activeAccountantReport, setActiveAccountantReport] = useState("profitLoss");

  useEffect(() => {
    api.reports.summary().then(setData).catch((err) => setMessage(err.message));
    api.reports.dataQuality().then(setDataQuality).catch(() => {});
    api.monitoring.summary().then(setMonitoring).catch(() => {});
    if (user.role === "admin") {
      api.monitoring.alertSnapshot().then(setMonitoringAlertSnapshot).catch(() => {});
    }
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
      deposits: accountantData.depositRegister.reduce((sum, row) => sum + Number(row.deposit_amount || 0), 0),
      payables: Number(accountantData.contractorPayablesTotals?.open_amount || 0),
      overduePayables: Number(accountantData.contractorPayablesTotals?.overdue_amount || 0)
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
    const title =
      scope === "management"
        ? managementReportTitles[target] || managementReportTitles.all
        : accountantReportTitles[target] || accountantReportTitles.all;
    flushSync(() => {
      setPrintScope(scope);
      setPrintTarget(target);
      setPrintAllRows(true);
    });
    withPrintTitle(`${title} ${filters.start_date} to ${filters.end_date}`, () => window.print(), businessSettings);
    setPrintAllRows(false);
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
  const qualityIssueCount = dataQuality.reduce((sum, check) => sum + Number(check.count || 0), 0);
  const highQualityIssueCount = dataQuality
    .filter((check) => check.severity === "high")
    .reduce((sum, check) => sum + Number(check.count || 0), 0);
  const reviewableQualityCount = dataQuality.filter((check) => Number(check.count || 0) > 0 && check.records?.length).length;
  const monitoringSummary = monitoring?.summary || {};
  const receiptRegisterTable = useTableControls(accountantData?.receiptRegister || [], {
    searchFields: ["receipt_number", "payment_date", "customer_name", "acc_number", "payment_channel", "external_reference", "recorded_by_name"]
  });
  const allocationLedgerTable = useTableControls(accountantData?.allocationLedger || [], {
    searchFields: ["receipt_number", "payment_date", "customer_name", "acc_number", "bill_number", "billing_month", "payment_channel"]
  });
  const receivablesAgingTable = useTableControls(accountantData?.receivablesAging || [], {
    searchFields: ["customer_name", "acc_number", "zone_name", "oldest_due_date", "open_bill_count", "total_amount"]
  });
  const depositRegisterTable = useTableControls(accountantData?.depositRegister || [], {
    searchFields: ["customer_name", "acc_number", "zone_name", "deposit_amount", "deposit_paid", "deposit_paid_at"]
  });
  const expenseRegisterTable = useTableControls(accountantData?.expenseRegister || [], {
    searchFields: ["expense_date", "category", "vendor", "description", "payment_channel", "reference", "receipt_number", "recorded_by_name", "amount"]
  });
  const contractorBalanceTable = useTableControls(accountantData?.contractorBalances || [], {
    searchFields: ["contractor_name", "phone", "email", "tax_pin", "open_invoice_count", "open_amount", "overdue_amount"]
  });
  const contractorInvoiceTable = useTableControls(accountantData?.contractorInvoiceRegister || [], {
    searchFields: ["invoice_number", "contractor_name", "category", "description", "status", "total_amount", "expense_id"]
  });
  const maintenanceRegisterRows = printAllRows ? maintenanceRegisterTable.filteredRows : maintenanceRegisterTable.visibleRows;
  const customerBalanceRows = printAllRows ? customerBalanceTable.filteredRows : customerBalanceTable.visibleRows;
  const billingRegisterRows = printAllRows ? billingRegisterTable.filteredRows : billingRegisterTable.visibleRows;
  const receiptRegisterRows = printAllRows ? receiptRegisterTable.filteredRows : receiptRegisterTable.visibleRows;
  const allocationLedgerRows = printAllRows ? allocationLedgerTable.filteredRows : allocationLedgerTable.visibleRows;
  const receivablesAgingRows = printAllRows ? receivablesAgingTable.filteredRows : receivablesAgingTable.visibleRows;
  const depositRegisterRows = printAllRows ? depositRegisterTable.filteredRows : depositRegisterTable.visibleRows;
  const expenseRegisterRows = printAllRows ? expenseRegisterTable.filteredRows : expenseRegisterTable.visibleRows;
  const contractorBalanceRows = printAllRows ? contractorBalanceTable.filteredRows : contractorBalanceTable.visibleRows;
  const contractorInvoiceRows = printAllRows ? contractorInvoiceTable.filteredRows : contractorInvoiceTable.visibleRows;
  const billingSummaryTotals = data
    ? {
        bill_count: countRows(data.billingSummary, "bill_count"),
        units_billed: sumRows(data.billingSummary, "units_billed"),
        billed_amount: sumRows(data.billingSummary, "billed_amount"),
        paid_amount: sumRows(data.billingSummary, "paid_amount"),
        balance_amount: sumRows(data.billingSummary, "balance_amount")
      }
    : {};
  const agingSummaryTotals = data
    ? {
        bill_count: countRows(data.agingSummary, "bill_count"),
        balance_amount: sumRows(data.agingSummary, "balance_amount")
      }
    : {};
  const collectionsSummaryTotals = data
    ? {
        receipt_count: countRows(data.collectionsSummary, "receipt_count"),
        received_amount: sumRows(data.collectionsSummary, "received_amount"),
        allocated_amount: sumRows(data.collectionsSummary, "allocated_amount")
      }
    : {};
  const zoneReadingTotals = data
    ? {
        customer_count: countRows(data.zoneReadingSummary, "customer_count"),
        customers_with_readings: countRows(data.zoneReadingSummary, "customers_with_readings"),
        customers_without_readings: countRows(data.zoneReadingSummary, "customers_without_readings")
      }
    : {};
  const maintenanceStatusTotals = data
    ? {
        request_count: countRows(data.maintenanceByStatus || [], "request_count"),
        urgent_count: countRows(data.maintenanceByStatus || [], "urgent_count"),
        overdue_count: countRows(data.maintenanceByStatus || [], "overdue_count")
      }
    : {};
  const maintenanceCategoryTotals = data
    ? {
        request_count: countRows(data.maintenanceByCategory || [], "request_count"),
        urgent_count: countRows(data.maintenanceByCategory || [], "urgent_count"),
        overdue_count: countRows(data.maintenanceByCategory || [], "overdue_count")
      }
    : {};
  const maintenanceZoneTotals = data
    ? {
        request_count: countRows(data.maintenanceByZone || [], "request_count"),
        urgent_count: countRows(data.maintenanceByZone || [], "urgent_count"),
        overdue_count: countRows(data.maintenanceByZone || [], "overdue_count")
      }
    : {};
  const maintenanceAssigneeTotals = data
    ? {
        request_count: countRows(data.maintenanceByAssignee || [], "request_count"),
        open_count: countRows(data.maintenanceByAssignee || [], "open_count"),
        in_progress_count: countRows(data.maintenanceByAssignee || [], "in_progress_count"),
        overdue_count: countRows(data.maintenanceByAssignee || [], "overdue_count")
      }
    : {};
  const customerBalanceTotals = {
    open_bills: countRows(customerBalanceRows, "open_bills"),
    balance_due: sumRows(customerBalanceRows, "balance_due")
  };
  const billingRegisterTotals = {
    units_used: sumRows(billingRegisterRows, "units_used"),
    subtotal_amount: sumRows(billingRegisterRows, "subtotal_amount"),
    fixed_charge_amount: sumRows(billingRegisterRows, "fixed_charge_amount"),
    penalty_amount: sumRows(billingRegisterRows, "penalty_amount"),
    vat_amount: sumRows(billingRegisterRows, "vat_amount"),
    adjustment_amount: sumRows(billingRegisterRows, "adjustment_amount"),
    billed_amount: sumRows(billingRegisterRows, "billed_amount"),
    paid_amount: sumRows(billingRegisterRows, "paid_amount"),
    balance_amount: sumRows(billingRegisterRows, "balance_amount")
  };
  const receiptRegisterTotals = {
    amount: sumRows(receiptRegisterRows, "amount"),
    total_allocated_amount: sumRows(receiptRegisterRows, "total_allocated_amount")
  };
  const allocationLedgerTotals = {
    allocated_amount: sumRows(allocationLedgerRows, "allocated_amount")
  };
  const receivablesAgingTotals = agingBucketFields.reduce(
    (result, field) => ({ ...result, [field]: sumRows(receivablesAgingRows, field) }),
    { open_bill_count: countRows(receivablesAgingRows, "open_bill_count") }
  );
  const depositRegisterTotals = {
    deposit_amount: sumRows(depositRegisterRows, "deposit_amount")
  };
  const expenseCategoryTotals = accountantData
    ? {
        expense_count: countRows(accountantData.expensesByCategory, "expense_count"),
        expense_amount: sumRows(accountantData.expensesByCategory, "expense_amount")
      }
    : {};
  const expenseRegisterTotals = {
    amount: sumRows(expenseRegisterRows, "amount")
  };
  const contractorBalanceTotals = {
    open_invoice_count: countRows(contractorBalanceRows, "open_invoice_count"),
    open_amount: sumRows(contractorBalanceRows, "open_amount"),
    overdue_amount: sumRows(contractorBalanceRows, "overdue_amount"),
    overdue_invoice_count: countRows(contractorBalanceRows, "overdue_invoice_count")
  };
  const contractorInvoiceRegisterTotals = {
    subtotal_amount: sumRows(contractorInvoiceRows, "subtotal_amount"),
    vat_amount: sumRows(contractorInvoiceRows, "vat_amount"),
    total_amount: sumRows(contractorInvoiceRows, "total_amount"),
    document_count: countRows(contractorInvoiceRows, "document_count")
  };
  const billingByStatusTotals = accountantData
    ? {
        bill_count: countRows(accountantData.billingByStatus, "bill_count"),
        billed_amount: sumRows(accountantData.billingByStatus, "billed_amount"),
        paid_amount: sumRows(accountantData.billingByStatus, "paid_amount"),
        balance_amount: sumRows(accountantData.billingByStatus, "balance_amount")
      }
    : {};
  const collectionsByChannelTotals = accountantData
    ? {
        receipt_count: countRows(accountantData.collectionsByChannel, "receipt_count"),
        received_amount: sumRows(accountantData.collectionsByChannel, "received_amount"),
        allocated_amount: sumRows(accountantData.collectionsByChannel, "allocated_amount"),
        unallocated_amount: sumRows(accountantData.collectionsByChannel, "unallocated_amount")
      }
    : {};
  const billingByZoneTotals = accountantData
    ? {
        bill_count: countRows(accountantData.billingByZone, "bill_count"),
        units_billed: sumRows(accountantData.billingByZone, "units_billed"),
        billed_amount: sumRows(accountantData.billingByZone, "billed_amount"),
        paid_amount: sumRows(accountantData.billingByZone, "paid_amount"),
        balance_amount: sumRows(accountantData.billingByZone, "balance_amount")
      }
    : {};
  const contractorPayablesByStatusTotals = accountantData
    ? {
        invoice_count: countRows(accountantData.contractorPayablesByStatus, "invoice_count"),
        invoice_amount: sumRows(accountantData.contractorPayablesByStatus, "invoice_amount"),
        overdue_amount: sumRows(accountantData.contractorPayablesByStatus, "overdue_amount")
      }
    : {};
  const contractorPayablesAgingTotals = accountantData
    ? {
        invoice_count: countRows(accountantData.contractorPayablesAging, "invoice_count"),
        invoice_amount: sumRows(accountantData.contractorPayablesAging, "invoice_amount")
      }
    : {};
  const profitAndLoss = accountantData?.profitAndLoss || {};
  const cashProfit = profitAndLoss.cash || { revenue_lines: [], expense_lines: [], notes: [], totals: {} };
  const accrualProfit = profitAndLoss.accrual || { revenue_lines: [], expense_lines: [], notes: [], totals: {} };
  const managementReportCatalog = [
    { key: "billingSummary", title: "Billing Summary", detail: `${number(billingSummaryTotals.bill_count)} bills | ${money(billingSummaryTotals.billed_amount)} billed` },
    { key: "agingAnalysis", title: "Aging Analysis", detail: `${number(agingSummaryTotals.bill_count)} unpaid bills | ${money(agingSummaryTotals.balance_amount)} outstanding` },
    { key: "collections", title: "Collections", detail: `${number(collectionsSummaryTotals.receipt_count)} receipts | ${money(collectionsSummaryTotals.received_amount)} received` },
    { key: "routeSummary", title: "Route Reading Summary", detail: `${number(zoneReadingTotals.customers_without_readings)} missing readings` },
    { key: "maintenanceStatus", title: "Maintenance Status", detail: `${number(maintenanceStatusTotals.request_count)} requests` },
    { key: "maintenanceCategory", title: "Maintenance By Category", detail: `${number(maintenanceCategoryTotals.overdue_count)} overdue` },
    { key: "maintenanceZone", title: "Maintenance By Zone", detail: `${number(maintenanceZoneTotals.urgent_count)} urgent` },
    { key: "maintenanceAssignee", title: "Maintenance Assignment", detail: `${number(maintenanceAssigneeTotals.request_count)} assigned/open requests` },
    { key: "maintenanceRegister", title: "Maintenance Register", detail: `${number(maintenanceRegisterTable.total)} records` },
    { key: "customerBalances", title: "Customer Balances", detail: `${number(customerBalanceTable.total)} customers | ${money(customerBalanceTotals.balance_due)} balance` }
  ];
  const accountantReportCatalog = [
    { key: "profitLoss", title: "Profit And Loss", detail: `Cash ${money(cashProfit.totals?.net_profit)} | Accrual ${money(accrualProfit.totals?.net_profit)}` },
    { key: "billingStatus", title: "Billing By Status", detail: `${number(billingByStatusTotals.bill_count)} bills` },
    { key: "collectionsChannel", title: "Collections By Channel", detail: `${money(collectionsByChannelTotals.received_amount)} received` },
    { key: "billingZone", title: "Billing By Zone", detail: `${number(billingByZoneTotals.bill_count)} bills by zone` },
    { key: "billingRegister", title: "Billing Register", detail: `${number(billingRegisterTable.total)} bill rows` },
    { key: "receiptRegister", title: "Receipt Register", detail: `${number(receiptRegisterTable.total)} receipt rows` },
    { key: "allocationLedger", title: "Payment Allocation Ledger", detail: `${money(allocationLedgerTotals.allocated_amount)} allocated` },
    { key: "agingDetail", title: "Receivables Aging Detail", detail: `${number(receivablesAgingTable.total)} customers | ${money(receivablesAgingTotals.total_amount)} total` },
    { key: "depositRegister", title: "Deposit Register", detail: `${money(depositRegisterTotals.deposit_amount)} deposits` },
    { key: "expensesCategory", title: "Expenses By Category", detail: `${money(expenseCategoryTotals.expense_amount)} expenses` },
    { key: "expenseRegister", title: "Expense Register", detail: `${number(expenseRegisterTable.total)} expense rows` },
    { key: "contractorPayables", title: "Contractor Payables", detail: `${money(accountantData?.contractorPayablesTotals?.open_amount)} open` },
    { key: "contractorBalances", title: "Contractor Balances", detail: `${number(contractorBalanceTable.total)} contractors` },
    { key: "contractorInvoiceRegister", title: "Contractor Invoice Register", detail: `${number(contractorInvoiceTable.total)} invoices` }
  ];
  const showManagementReport = (key) =>
    printAllRows && printScope === "management" ? printTarget === "all" || printTarget === key : activeManagementReport === key;
  const showAccountantReport = (key) =>
    printAllRows && printScope === "accountant" ? printTarget === "all" || printTarget === key : activeAccountantReport === key;
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

      {hasDataQualityFocus ? (
        <FocusNotice
          title={focusedQualityLabel}
          detail="Showing the data-quality check that needs review. Clear focus to return to all report checks."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <div className="panel screen-only">
        <div className="panel-heading">
          <div>
            <h3>Data Quality Checks</h3>
            <p className="muted">
              {qualityIssueCount
                ? `${number(qualityIssueCount)} finding(s), ${number(highQualityIssueCount)} high priority.`
                : "No active findings from the current checks."}
            </p>
          </div>
          {reviewableQualityCount ? (
            <span className="status status-pending">{number(reviewableQualityCount)} reviewable</span>
          ) : (
            <span className="status status-paid">clear</span>
          )}
        </div>
        <div className="report-catalog compact-report-catalog">
          {visibleDataQuality.map((check) => (
            <button
              className={selectedQuality?.key === check.key ? "report-catalog-item active" : "report-catalog-item"}
              disabled={!check.records?.length}
              key={check.key}
              onClick={() => setSelectedQualityKey(check.key)}
              type="button"
            >
              <strong>{check.label}</strong>
              <span>{label(check.severity)} | {number(check.count)} finding(s)</span>
              <small>{check.records?.length ? "Open review detail" : check.detail}</small>
            </button>
          ))}
          {!visibleDataQuality.length ? <p className="muted">No checks available.</p> : null}
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

      <div className="panel screen-only">
        <div className="panel-heading">
          <div>
            <h3>Application Monitoring</h3>
            <p className="muted">
              {monitoring
                ? `Checked ${monitoring.checked_at?.slice(0, 19).replace("T", " ")} | API ${monitoring.api} | DB ${monitoring.database}`
                : "Monitoring summary is loading."}
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => {
                api.monitoring.summary().then(setMonitoring).catch((err) => setMessage(err.message));
                if (user.role === "admin") api.monitoring.alertSnapshot().then(setMonitoringAlertSnapshot).catch(() => {});
              }}
            >
              <RefreshCw size={17} />
              Refresh
            </button>
            {user.role === "admin" ? (
              <button
                type="button"
                onClick={() => api.monitoring.sendTestAlert().then((result) => setMessage(`Monitoring alert check completed: ${result.results?.length || 0} recipient(s).`)).catch((err) => setMessage(err.message))}
              >
                Send test alert
              </button>
            ) : null}
          </div>
        </div>
        <div className="stat-grid compact-stat-grid">
          <StatCard label="Errors 24h" value={number(monitoringSummary.errors_24h)} detail={`${number(monitoringSummary.unresolved_errors)} unresolved`} />
          <StatCard label="Login Failures" value={number(monitoringSummary.login_failures_24h)} detail="Last 24 hours" />
          <StatCard label="API Errors" value={number(monitoringSummary.api_errors_24h)} detail="Server-side failures" />
          <StatCard label="Page Crashes" value={number(monitoringSummary.client_errors_24h)} detail="Client-side reports" />
          {user.role === "admin" ? (
            <StatCard
              label="Alert Window"
              value={monitoringAlertSnapshot?.status || "-"}
              detail={`${number(monitoringAlertSnapshot?.event_count)} event(s), DB ${monitoringAlertSnapshot?.database || "-"}`}
            />
          ) : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Path</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {monitoring?.recent_events?.length ? (
                monitoring.recent_events.slice(0, 12).map((event) => (
                  <tr key={event.id}>
                    <td>{event.created_at?.slice(0, 19).replace("T", " ")}</td>
                    <td>{label(event.event_type)}</td>
                    <td><span className={`status status-${event.severity}`}>{event.severity}</span></td>
                    <td>{label(event.source)}</td>
                    <td>{event.path || "-"}</td>
                    <td>
                      {event.message}
                      {event.actor_name ? <small>{event.actor_name}</small> : null}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={6} title="No monitoring events" detail="Server errors, login failures, and page crashes will appear here." />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel screen-only">
        <div className="panel-heading">
          <div>
            <h3>Management Report Catalog</h3>
            <p className="muted">Choose one report to open. Print all remains available from the page header.</p>
          </div>
        </div>
        <div className="report-catalog">
          {managementReportCatalog.map((report) => (
            <button
              className={activeManagementReport === report.key ? "report-catalog-item active" : "report-catalog-item"}
              key={report.key}
              onClick={() => setActiveManagementReport(report.key)}
              type="button"
            >
              <strong>{report.title}</strong>
              <span>{report.detail}</span>
            </button>
          ))}
        </div>
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
        <div className={reportSectionClass("panel management-section management-section-billingSummary", showManagementReport("billingSummary"))}>
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
                {data.billingSummary.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(billingSummaryTotals.bill_count)}</strong></td>
                    <td><strong>{number(billingSummaryTotals.units_billed)}</strong></td>
                    <td><strong>{money(billingSummaryTotals.billed_amount)}</strong></td>
                    <td><strong>{money(billingSummaryTotals.paid_amount)}</strong></td>
                    <td><strong>{money(billingSummaryTotals.balance_amount)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-agingAnalysis", showManagementReport("agingAnalysis"))}>
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
                {data.agingSummary.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(agingSummaryTotals.bill_count)}</strong></td>
                    <td><strong>{money(agingSummaryTotals.balance_amount)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-collections", showManagementReport("collections"))}>
          <div className="panel-heading">
            <h3>Collections</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "collections")} title="Print collections">
              <Printer size={17} />
            </button>
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
                {data.collectionsSummary.length ? (
                  <tr className="muted-total">
                    <td colSpan="2"><strong>Total</strong></td>
                    <td><strong>{number(collectionsSummaryTotals.receipt_count)}</strong></td>
                    <td><strong>{money(collectionsSummaryTotals.received_amount)}</strong></td>
                    <td><strong>{money(collectionsSummaryTotals.allocated_amount)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-routeSummary", showManagementReport("routeSummary"))}>
          <div className="panel-heading">
            <h3>Route Reading Summary</h3>
            <button className="icon-button screen-only" type="button" onClick={() => printReport("management", "routeSummary")} title="Print route reading summary">
              <Printer size={17} />
            </button>
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
                {data.zoneReadingSummary.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(zoneReadingTotals.customer_count)}</strong></td>
                    <td><strong>{number(zoneReadingTotals.customers_with_readings)}</strong></td>
                    <td><strong>{number(zoneReadingTotals.customers_without_readings)}</strong></td>
                    <td>-</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-maintenanceStatus", showManagementReport("maintenanceStatus"))}>
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
                {data.maintenanceByStatus?.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(maintenanceStatusTotals.request_count)}</strong></td>
                    <td><strong>{number(maintenanceStatusTotals.urgent_count)}</strong></td>
                    <td><strong>{number(maintenanceStatusTotals.overdue_count)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-maintenanceCategory", showManagementReport("maintenanceCategory"))}>
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
                {data.maintenanceByCategory?.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(maintenanceCategoryTotals.request_count)}</strong></td>
                    <td><strong>{number(maintenanceCategoryTotals.urgent_count)}</strong></td>
                    <td><strong>{number(maintenanceCategoryTotals.overdue_count)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-maintenanceZone", showManagementReport("maintenanceZone"))}>
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
                {data.maintenanceByZone?.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(maintenanceZoneTotals.request_count)}</strong></td>
                    <td><strong>{number(maintenanceZoneTotals.urgent_count)}</strong></td>
                    <td><strong>{number(maintenanceZoneTotals.overdue_count)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel management-section management-section-maintenanceAssignee", showManagementReport("maintenanceAssignee"))}>
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
                {data.maintenanceByAssignee?.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(maintenanceAssigneeTotals.request_count)}</strong></td>
                    <td><strong>{number(maintenanceAssigneeTotals.open_count)}</strong></td>
                    <td><strong>{number(maintenanceAssigneeTotals.in_progress_count)}</strong></td>
                    <td><strong>{number(maintenanceAssigneeTotals.overdue_count)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={reportSectionClass("panel full-span management-section management-section-maintenanceRegister", showManagementReport("maintenanceRegister"))}>
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

        <div className={reportSectionClass("panel full-span management-section management-section-customerBalances", showManagementReport("customerBalances"))}>
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
                {customerBalanceTable.total ? (
                  <tr className="muted-total">
                    <td colSpan="3"><strong>Total</strong></td>
                    <td><strong>{number(customerBalanceTotals.open_bills)}</strong></td>
                    <td>-</td>
                    <td><strong>{money(customerBalanceTotals.balance_due)}</strong></td>
                  </tr>
                ) : null}
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
        {accountantData && accountantTotals ? (
          <div className="panel screen-only">
            <div className="panel-heading">
              <div>
                <h3>Accountant Report Catalog</h3>
                <p className="muted">Choose one report to open for review. Use the printer button in a report for individual printing.</p>
              </div>
            </div>
            <div className="report-catalog">
              {accountantReportCatalog.map((report) => (
                <button
                  className={activeAccountantReport === report.key ? "report-catalog-item active" : "report-catalog-item"}
                  key={report.key}
                  onClick={() => setActiveAccountantReport(report.key)}
                  type="button"
                >
                  <strong>{report.title}</strong>
                  <span>{report.detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
              <StatCard label="Open payables" value={money(accountantTotals.payables)} detail="Contractor invoices not posted/paid" />
              <StatCard label="Overdue payables" value={money(accountantTotals.overduePayables)} detail="Past due contractor invoices" />
              <StatCard label="Cash net profit" value={money(cashProfit.totals?.net_profit)} detail={`Margin ${percent(cashProfit.totals?.margin)}`} />
              <StatCard label="Accrual net profit" value={money(accrualProfit.totals?.net_profit)} detail={`Margin ${percent(accrualProfit.totals?.margin)}`} />
            </div>

            <section className="report-grid">
              <div className={reportSectionClass("full-span report-section report-section-profitLoss", showAccountantReport("profitLoss"))}>
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

              <div className={reportSectionClass("panel report-section report-section-billingStatus", showAccountantReport("billingStatus"))}>
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
                      {accountantData.billingByStatus.length ? (
                        <tr className="muted-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{number(billingByStatusTotals.bill_count)}</strong></td>
                          <td><strong>{money(billingByStatusTotals.billed_amount)}</strong></td>
                          <td><strong>{money(billingByStatusTotals.paid_amount)}</strong></td>
                          <td><strong>{money(billingByStatusTotals.balance_amount)}</strong></td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel report-section report-section-collectionsChannel", showAccountantReport("collectionsChannel"))}>
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
                      {accountantData.collectionsByChannel.length ? (
                        <tr className="muted-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{number(collectionsByChannelTotals.receipt_count)}</strong></td>
                          <td><strong>{money(collectionsByChannelTotals.received_amount)}</strong></td>
                          <td><strong>{money(collectionsByChannelTotals.allocated_amount)}</strong></td>
                          <td><strong>{money(collectionsByChannelTotals.unallocated_amount)}</strong></td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-billingZone", showAccountantReport("billingZone"))}>
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
                      {accountantData.billingByZone.length ? (
                        <tr className="muted-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{number(billingByZoneTotals.bill_count)}</strong></td>
                          <td><strong>{number(billingByZoneTotals.units_billed)}</strong></td>
                          <td><strong>{money(billingByZoneTotals.billed_amount)}</strong></td>
                          <td><strong>{money(billingByZoneTotals.paid_amount)}</strong></td>
                          <td><strong>{money(billingByZoneTotals.balance_amount)}</strong></td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-billingRegister", showAccountantReport("billingRegister"))}>
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
                        <>
                          {billingRegisterRows.map((row) => (
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
                          ))}
                          <tr className="muted-total">
                            <td colSpan="4"><strong>Total</strong></td>
                            <td><strong>{number(billingRegisterTotals.units_used)}</strong></td>
                            <td>-</td>
                            <td><strong>{money(billingRegisterTotals.subtotal_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.fixed_charge_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.penalty_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.vat_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.adjustment_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.billed_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.paid_amount)}</strong></td>
                            <td><strong>{money(billingRegisterTotals.balance_amount)}</strong></td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={14} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-receiptRegister", showAccountantReport("receiptRegister"))}>
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
                        <>
                          {receiptRegisterRows.map((row) => (
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
                          ))}
                          <tr className="muted-total">
                            <td colSpan="5"><strong>Total</strong></td>
                            <td><strong>{money(receiptRegisterTotals.amount)}</strong></td>
                            <td><strong>{money(receiptRegisterTotals.total_allocated_amount)}</strong></td>
                            <td>-</td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={8} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-allocationLedger", showAccountantReport("allocationLedger"))}>
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
                        <>
                          {allocationLedgerRows.map((row) => (
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
                          ))}
                          <tr className="muted-total">
                            <td colSpan="6"><strong>Total</strong></td>
                            <td><strong>{money(allocationLedgerTotals.allocated_amount)}</strong></td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={7} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-agingDetail", showAccountantReport("agingDetail"))}>
                <div className="panel-heading">
                  <h3>Receivables Aging Detail</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "agingDetail")} title="Print aging detail">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={receivablesAgingTable} label="customers" placeholder="Search aging detail" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Current</th>
                        <th>1-30</th>
                        <th>31-60</th>
                        <th>61-90</th>
                        <th>91 and over</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivablesAgingTable.total ? (
                        <>
                          {receivablesAgingRows.map((row) => (
                            <tr key={row.customer_id}>
                              <td>
                                {row.customer_name}
                                <small>{row.acc_number} | {row.zone_name}</small>
                                <small>{number(row.open_bill_count)} bill(s), oldest due {date(row.oldest_due_date)}</small>
                              </td>
                              <td>{money(row.current_amount)}</td>
                              <td>{money(row.days_1_30_amount)}</td>
                              <td>{money(row.days_31_60_amount)}</td>
                              <td>{money(row.days_61_90_amount)}</td>
                              <td>{money(row.days_91_over_amount)}</td>
                              <td>{money(row.total_amount)}</td>
                            </tr>
                          ))}
                          <tr className="muted-total">
                            <td>
                              <strong>Total</strong>
                              <small>{number(receivablesAgingTotals.open_bill_count)} open bill(s)</small>
                            </td>
                            <td><strong>{money(receivablesAgingTotals.current_amount)}</strong></td>
                            <td><strong>{money(receivablesAgingTotals.days_1_30_amount)}</strong></td>
                            <td><strong>{money(receivablesAgingTotals.days_31_60_amount)}</strong></td>
                            <td><strong>{money(receivablesAgingTotals.days_61_90_amount)}</strong></td>
                            <td><strong>{money(receivablesAgingTotals.days_91_over_amount)}</strong></td>
                            <td><strong>{money(receivablesAgingTotals.total_amount)}</strong></td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={7} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-depositRegister", showAccountantReport("depositRegister"))}>
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
                        <>
                          {depositRegisterRows.map((row) => (
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
                          ))}
                          <tr className="muted-total">
                            <td colSpan="2"><strong>Total</strong></td>
                            <td><strong>{money(depositRegisterTotals.deposit_amount)}</strong></td>
                            <td colSpan="2">-</td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={5} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel report-section report-section-expensesCategory", showAccountantReport("expensesCategory"))}>
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
                      {accountantData.expensesByCategory.length ? (
                        <tr className="muted-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{number(expenseCategoryTotals.expense_count)}</strong></td>
                          <td><strong>{money(expenseCategoryTotals.expense_amount)}</strong></td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-expenseRegister", showAccountantReport("expenseRegister"))}>
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
                        <>
                          {expenseRegisterRows.map((row) => (
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
                          ))}
                          <tr className="muted-total">
                            <td colSpan="7"><strong>Total</strong></td>
                            <td><strong>{money(expenseRegisterTotals.amount)}</strong></td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={8} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-contractorPayables", showAccountantReport("contractorPayables"))}>
                <div className="panel-heading">
                  <h3>Contractor Payables</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "contractorPayables")} title="Print contractor payables">
                    <Printer size={17} />
                  </button>
                </div>
                <div className="reading-context">
                  <div>
                    <span>Open invoices</span>
                    <strong>{number(accountantData.contractorPayablesTotals?.open_invoice_count)}</strong>
                  </div>
                  <div>
                    <span>Open amount</span>
                    <strong>{money(accountantData.contractorPayablesTotals?.open_amount)}</strong>
                  </div>
                  <div>
                    <span>Approved</span>
                    <strong>{money(accountantData.contractorPayablesTotals?.approved_amount)}</strong>
                  </div>
                  <div>
                    <span>Overdue</span>
                    <strong>{money(accountantData.contractorPayablesTotals?.overdue_amount)}</strong>
                  </div>
                  <div>
                    <span>Posted this period</span>
                    <strong>{money(accountantData.contractorPayablesTotals?.posted_amount)}</strong>
                  </div>
                </div>
                <div className="report-grid">
                  <div className="panel">
                    <div className="panel-heading compact-heading">
                      <h3>By Status</h3>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>Invoices</th>
                            <th>Amount</th>
                            <th>Overdue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountantData.contractorPayablesByStatus.length ? (
                            accountantData.contractorPayablesByStatus.map((row) => (
                              <tr key={row.status}>
                                <td>{label(row.status)}</td>
                                <td>{number(row.invoice_count)}</td>
                                <td>{money(row.invoice_amount)}</td>
                                <td>{money(row.overdue_amount)}</td>
                              </tr>
                            ))
                          ) : (
                            <EmptyRow colSpan={4} />
                          )}
                          {accountantData.contractorPayablesByStatus.length ? (
                            <tr className="muted-total">
                              <td><strong>Total</strong></td>
                              <td><strong>{number(contractorPayablesByStatusTotals.invoice_count)}</strong></td>
                              <td><strong>{money(contractorPayablesByStatusTotals.invoice_amount)}</strong></td>
                              <td><strong>{money(contractorPayablesByStatusTotals.overdue_amount)}</strong></td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-heading compact-heading">
                      <h3>Aging</h3>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Bucket</th>
                            <th>Invoices</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountantData.contractorPayablesAging.length ? (
                            accountantData.contractorPayablesAging.map((row) => (
                              <tr key={row.bucket}>
                                <td>{row.bucket}</td>
                                <td>{number(row.invoice_count)}</td>
                                <td>{money(row.invoice_amount)}</td>
                              </tr>
                            ))
                          ) : (
                            <EmptyRow colSpan={3} />
                          )}
                          {accountantData.contractorPayablesAging.length ? (
                            <tr className="muted-total">
                              <td><strong>Total</strong></td>
                              <td><strong>{number(contractorPayablesAgingTotals.invoice_count)}</strong></td>
                              <td><strong>{money(contractorPayablesAgingTotals.invoice_amount)}</strong></td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-contractorBalances", showAccountantReport("contractorBalances"))}>
                <div className="panel-heading">
                  <h3>Contractor Balances</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "contractorBalances")} title="Print contractor balances">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={contractorBalanceTable} label="contractors" placeholder="Search contractor balances" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contractor</th>
                        <th>Contact</th>
                        <th>Open Invoices</th>
                        <th>Oldest Due</th>
                        <th>Open Amount</th>
                        <th>Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractorBalanceTable.total ? (
                        <>
                          {contractorBalanceRows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.contractor_name}
                                <small>{row.tax_pin || "-"}</small>
                              </td>
                              <td>
                                {row.phone || "-"}
                                <small>{row.email || "-"}</small>
                              </td>
                              <td>{number(row.open_invoice_count)}</td>
                              <td>{date(row.oldest_due_date)}</td>
                              <td>{money(row.open_amount)}</td>
                              <td>
                                {money(row.overdue_amount)}
                                <small>{number(row.overdue_invoice_count)} invoice(s)</small>
                              </td>
                            </tr>
                          ))}
                          <tr className="muted-total">
                            <td colSpan="2"><strong>Total</strong></td>
                            <td><strong>{number(contractorBalanceTotals.open_invoice_count)}</strong></td>
                            <td>-</td>
                            <td><strong>{money(contractorBalanceTotals.open_amount)}</strong></td>
                            <td>
                              <strong>{money(contractorBalanceTotals.overdue_amount)}</strong>
                              <small>{number(contractorBalanceTotals.overdue_invoice_count)} invoice(s)</small>
                            </td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={6} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={reportSectionClass("panel full-span report-section report-section-contractorInvoiceRegister", showAccountantReport("contractorInvoiceRegister"))}>
                <div className="panel-heading">
                  <h3>Contractor Invoice Register</h3>
                  <button className="icon-button screen-only" type="button" onClick={() => printReport("accountant", "contractorInvoiceRegister")} title="Print contractor invoice register">
                    <Printer size={17} />
                  </button>
                </div>
                <TableControls table={contractorInvoiceTable} label="contractor invoices" placeholder="Search contractor invoices" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Contractor</th>
                        <th>Dates</th>
                        <th>Category</th>
                        <th>Subtotal</th>
                        <th>VAT</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Expense</th>
                        <th>Documents</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractorInvoiceTable.total ? (
                        <>
                          {contractorInvoiceRows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.invoice_number}
                                <small>{row.description}</small>
                              </td>
                              <td>
                                {row.contractor_name}
                                <small>{row.contractor_tax_pin || "-"}</small>
                              </td>
                              <td>
                                {date(row.invoice_date)}
                                <small>Due {date(row.due_date)}</small>
                              </td>
                              <td>{row.category}</td>
                              <td>{money(row.subtotal_amount)}</td>
                              <td>{money(row.vat_amount)}</td>
                              <td>{money(row.total_amount)}</td>
                              <td>{label(row.status)}</td>
                              <td>{row.expense_id ? `Expense #${row.expense_id}` : "-"}</td>
                              <td>{number(row.document_count)}</td>
                            </tr>
                          ))}
                          <tr className="muted-total">
                            <td colSpan="4"><strong>Total</strong></td>
                            <td><strong>{money(contractorInvoiceRegisterTotals.subtotal_amount)}</strong></td>
                            <td><strong>{money(contractorInvoiceRegisterTotals.vat_amount)}</strong></td>
                            <td><strong>{money(contractorInvoiceRegisterTotals.total_amount)}</strong></td>
                            <td colSpan="2">-</td>
                            <td><strong>{number(contractorInvoiceRegisterTotals.document_count)}</strong></td>
                          </tr>
                        </>
                      ) : (
                        <EmptyRow colSpan={10} />
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
