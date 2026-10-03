import { Info, Printer, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { EmptyTableRow } from "../components/EmptyState";
import AccountingBillingOperationsReports from "../components/AccountingBillingOperationsReports";
import AccountingCloseSupportReports from "../components/AccountingCloseSupportReports";
import AccountingCollectionsControlReports from "../components/AccountingCollectionsControlReports";
import AccountingContractorLedgerReports from "../components/AccountingContractorLedgerReports";
import AccountingRevenueReports from "../components/AccountingRevenueReports";
import CashFlowForecastPanel from "../components/CashFlowForecastPanel";
import ContractorPayablesReport from "../components/ContractorPayablesReport";
import DataQualityPanel from "../components/DataQualityPanel";
import FocusNotice from "../components/FocusNotice";
import ManagementPerformanceMetrics from "../components/ManagementPerformanceMetrics";
import ManagementMetricDefinitions from "../components/ManagementMetricDefinitions";
import ManagementCustomerReports from "../components/ManagementCustomerReports";
import ManagementMaintenanceReports from "../components/ManagementMaintenanceReports";
import ManagementRevenueReports from "../components/ManagementRevenueReports";
import MonthlyBudgetControl from "../components/MonthlyBudgetControl";
import ReportCatalog from "../components/ReportCatalog";
import ReportPanelHeading from "../components/ReportPanelHeading";
import ReportPrintHeader from "../components/ReportPrintHeader";
import ReportSummaryCards from "../components/ReportSummaryCards";
import ProfitStatement from "../components/ProfitStatement";
import TableControls, { useTableControls } from "../components/TableControls";
import WorkspaceState from "../components/WorkspaceState";
import { api, assetUrl } from "../services/api";
import { withPrintTitle } from "../utils/exportNames";
import {
  filtersForReportPeriod,
  lastConcludedMonth,
  readCustomReportPeriod,
  readReportPeriodPreset,
  reportPeriodPresets,
  saveCustomReportPeriod,
  saveReportPeriodPreset
} from "../utils/reportPeriodPresets";
import useReportsWorkspaceData from "../hooks/useReportsWorkspaceData";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const moneyOrDash = (value) => (value === null || value === undefined ? "-" : money(value));
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const statusKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "_");
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

const defaultFilters = () => filtersForReportPeriod("previous_month");
const blankMonthlyBudget = () => ({
  budget_month: lastConcludedMonth().key,
  revenue_target: "",
  collection_target: "",
  operating_expense_budget: "",
  notes: ""
});
const monthLabel = (value) =>
  new Date(`${String(value || "").slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

const managementReportTitles = {
  all: "Management Reports",
  billingSummary: "Billing Summary",
  agingAnalysis: "Aging Analysis",
  collections: "Collections",
  routeSummary: "Route Reading Summary",
  clientFinancialSummary: "Client Financial Summary",
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
  serviceCharges: "Customer Service Charges",
  meterConsumptionComparison: "Meter Consumption Comparison",
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

function ReportsPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [budgetForm, setBudgetForm] = useState(blankMonthlyBudget);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState("");
  const [printScope, setPrintScope] = useState("accountant");
  const [printTarget, setPrintTarget] = useState("all");
  const [filters, setFilters] = useState(defaultFilters);
  const [periodPreset, setPeriodPreset] = useState(() => readReportPeriodPreset(user));
  const [printAllRows, setPrintAllRows] = useState(false);
  const [selectedQualityKey, setSelectedQualityKey] = useState("");
  const [activeManagementReport, setActiveManagementReport] = useState("billingSummary");
  const [activeAccountantReport, setActiveAccountantReport] = useState("profitLoss");
  const [metricDefinitionsOpen, setMetricDefinitionsOpen] = useState(false);
  const {
    accountantData,
    accountantLoading,
    accountantMessage,
    budgetVariance,
    businessSettings,
    cashFlowForecast,
    data,
    dataQuality,
    loadAccountantReports,
    loadSummary,
    productionReport,
    setBudgetVariance,
    summaryError,
    summaryLoading
  } = useReportsWorkspaceData();

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    const savedPreset = readReportPeriodPreset(user);
    const nextFilters = savedPreset === "custom" ? readCustomReportPeriod(user) || defaultFilters() : filtersForReportPeriod(savedPreset);
    setPeriodPreset(savedPreset);
    setFilters(nextFilters);
    loadAccountantReports(nextFilters);
  }, [user?.access_profile_id, user?.id, user?.role]);

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
      maintenanceResolved30d: Number(data.maintenanceTotals?.resolved_30d || 0),
      maintenanceResolutionDays: Number(data.maintenanceTotals?.avg_resolution_days || 0)
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
      serviceCharges: Number(accountantData.serviceChargeTotals?.charged_amount || 0),
      deposits: accountantData.depositRegister.reduce((sum, row) => sum + Number(row.deposit_amount || 0), 0),
      payables: Number(accountantData.contractorPayablesTotals?.open_amount || 0),
      overduePayables: Number(accountantData.contractorPayablesTotals?.overdue_amount || 0),
      unitsBilled: Number(accountantData.billingTotals?.units_billed || 0),
      approvedPayrollLiability: Number(accountantData.payrollLiabilityTotals?.approved_amount || 0),
      approvedPayrollRuns: Number(accountantData.payrollLiabilityTotals?.approved_run_count || 0)
    };
  }, [accountantData]);

  const productionTotals = useMemo(() => {
    const weeks = productionReport?.weeks || [];
    return weeks.reduce(
      (summary, week) => ({
        weekCount: summary.weekCount + 1,
        consumption: summary.consumption + Number(week.total_consumption || 0),
        revenue: summary.revenue + Number(week.total_revenue || 0)
      }),
      { weekCount: 0, consumption: 0, revenue: 0 }
    );
  }, [productionReport]);

  const reportMetrics = useMemo(() => {
    if (!accountantTotals || !totals) return [];
    const productionGap = productionTotals.consumption - accountantTotals.unitsBilled;
    return [
      {
        key: "production-variance",
        label: "Output / billed variance",
        value: productionTotals.weekCount ? `${productionGap > 0 ? "+" : productionGap < 0 ? "-" : ""}${number(Math.abs(productionGap))} units` : "Awaiting data",
        target: { page: "production", focus: "production_gap", label: "Production report" }
      },
      {
        key: "maintenance-turnaround",
        label: "Maintenance turnaround",
        value: `${totals.maintenanceResolutionDays.toFixed(1)} days`,
        target: { page: "maintenance", focus: "overdue_maintenance", label: "Maintenance work" }
      },
      {
        key: "approved-payroll-liability",
        label: "Approved payroll liability",
        value: money(accountantTotals.approvedPayrollLiability),
        target: { page: "payroll", focus: "payroll_attention", label: "Payroll control" }
      },
      {
        key: "contractor-payables",
        label: "Open contractor payables",
        value: money(accountantTotals.payables),
        target: { page: "contractors", focus: "overdue_supplier_invoices", label: "Supplier payables" }
      }
    ];
  }, [accountantTotals, productionTotals, totals]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setPeriodPreset("custom");
    saveReportPeriodPreset(user, "custom");
    setFilters((current) => {
      const nextFilters = { ...current, [name]: value };
      saveCustomReportPeriod(user, nextFilters);
      return nextFilters;
    });
  };

  const handlePeriodPresetChange = (event) => {
    const nextPreset = event.target.value;
    setPeriodPreset(nextPreset);
    saveReportPeriodPreset(user, nextPreset);
    if (nextPreset === "custom") return;
    const nextFilters = filtersForReportPeriod(nextPreset);
    setFilters(nextFilters);
    loadAccountantReports(nextFilters);
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    loadAccountantReports(filters);
  };

  const saveMonthlyBudget = async (event) => {
    event.preventDefault();
    setBudgetMessage("");
    setBudgetSaving(true);
    try {
      await api.reports.saveMonthlyBudget(budgetForm.budget_month, {
        revenue_target: Number(budgetForm.revenue_target),
        collection_target: Number(budgetForm.collection_target),
        operating_expense_budget: Number(budgetForm.operating_expense_budget),
        notes: budgetForm.notes
      });
      setBudgetForm(blankMonthlyBudget());
      setBudgetVariance(await api.reports.budgetVariance());
      setBudgetMessage("Monthly budget saved.");
    } catch (err) {
      setBudgetMessage(err.message);
    } finally {
      setBudgetSaving(false);
    }
  };

  const monthlyForecastBaseline = cashFlowForecast?.rows?.find(
    (row) => String(row.month_start || "").slice(0, 7) === budgetForm.budget_month
  );

  const applyForecastBudgetBaseline = () => {
    if (!monthlyForecastBaseline) return;
    setBudgetForm((current) => ({
      ...current,
      revenue_target: String(monthlyForecastBaseline.expected_billings),
      collection_target: String(monthlyForecastBaseline.projected_collections),
      operating_expense_budget: String(monthlyForecastBaseline.projected_expenses),
      notes: current.notes || "Forecast baseline loaded for review before budget approval."
    }));
    setBudgetMessage("Forecast baseline loaded. Review it before saving.");
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
  const clientFinancialSummaryTable = useTableControls(data?.clientFinancialSummary || [], {
    searchFields: [
      "customer",
      "acc_number",
      "last_billed_period",
      "last_due_date",
      "last_payment_date",
      "last_payment_amount",
      "current_outstanding",
      "open_bills",
      "months_unpaid",
      "payment_status"
    ]
  });
  const billingRegisterTable = useTableControls(accountantData?.billingRegister || [], {
    searchFields: ["bill_number", "billing_period_name", "billing_month", "customer_name", "acc_number", "zone_name", "balance_amount", "service_charge_description"]
  });
  const serviceChargeRegisterTable = useTableControls(accountantData?.serviceChargeRegister || [], {
    searchFields: ["charge_number", "charge_type", "description", "customer_name", "acc_number", "zone_name", "bill_number", "status", "bill_status"]
  });
  const meterConsumptionComparisonTable = useTableControls(accountantData?.meterConsumptionComparison || [], {
    searchFields: [
      "customer_name",
      "acc_number",
      "zone_name",
      "client_meter_number",
      "source_meter_number",
      "client_bill_number",
      "source_bill_number",
      "comparison_status"
    ]
  });
  const focusKey = navigationIntent?.page === "reports" ? navigationIntent.focus : "";
  const dataQualityFocusKeys = ["duplicate_open_payable_bills", "future_dated_operational_records"];
  const hasDataQualityFocus = dataQualityFocusKeys.includes(focusKey);
  const hasMonthlyBudgetFocus = focusKey === "monthly_budget";
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
  const budgetRows = budgetVariance?.rows || [];
  const budgetAttentionCount = budgetRows.filter((row) => row.revenue_status === "behind").length;
  const currentBudgetMonth = lastConcludedMonth().key;
  const currentBudget = budgetRows.find((row) => String(row.budget_month).startsWith(currentBudgetMonth));
  const canManageMonthlyBudget = ["admin", "accountant"].includes(user?.role);
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
  const clientFinancialSummaryRows = printAllRows
    ? clientFinancialSummaryTable.filteredRows
    : clientFinancialSummaryTable.visibleRows;
  const billingRegisterRows = printAllRows ? billingRegisterTable.filteredRows : billingRegisterTable.visibleRows;
  const serviceChargeRows = printAllRows ? serviceChargeRegisterTable.filteredRows : serviceChargeRegisterTable.visibleRows;
  const meterConsumptionComparisonRows = printAllRows
    ? meterConsumptionComparisonTable.filteredRows
    : meterConsumptionComparisonTable.visibleRows;
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
  const clientFinancialSummaryTotals = {
    current_outstanding: sumRows(clientFinancialSummaryRows, "current_outstanding"),
    open_bills: countRows(clientFinancialSummaryRows, "open_bills")
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
  const serviceChargeRegisterTotals = {
    charge_count: countRows(serviceChargeRows, "id"),
    amount: sumRows(serviceChargeRows, "amount"),
    paid_amount: sumRows(serviceChargeRows, "paid_amount"),
    balance_amount: sumRows(serviceChargeRows, "balance_amount")
  };
  const meterConsumptionComparisonTotals = {
    client_units_used: sumRows(meterConsumptionComparisonRows, "client_units_used"),
    source_units_used: sumRows(meterConsumptionComparisonRows, "source_units_used"),
    variance_units: sumRows(meterConsumptionComparisonRows, "variance_units")
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
    { key: "clientFinancialSummary", title: "Client Financial Summary", detail: `${number(clientFinancialSummaryTable.total)} clients | ${money(clientFinancialSummaryTotals.current_outstanding)} outstanding` },
    { key: "customerBalances", title: "Customer Balances", detail: `${number(customerBalanceTable.total)} customers | ${money(customerBalanceTotals.balance_due)} balance` }
  ];
  const accountantReportCatalog = [
    { key: "profitLoss", title: "Profit And Loss", detail: `Cash ${money(cashProfit.totals?.net_profit)} | Accrual ${money(accrualProfit.totals?.net_profit)}` },
    { key: "billingStatus", title: "Billing By Status", detail: `${number(billingByStatusTotals.bill_count)} bills` },
    { key: "collectionsChannel", title: "Collections By Channel", detail: `${money(collectionsByChannelTotals.received_amount)} received` },
    { key: "billingZone", title: "Billing By Zone", detail: `${number(billingByZoneTotals.bill_count)} bills by zone` },
    { key: "billingRegister", title: "Billing Register", detail: `${number(billingRegisterTable.total)} bill rows` },
    { key: "serviceCharges", title: "Customer Service Charges", detail: `${number(serviceChargeRegisterTable.total)} charges | ${money(accountantData?.serviceChargeTotals?.balance_amount)} open` },
    { key: "meterConsumptionComparison", title: "Meter Consumption Comparison", detail: `${number(meterConsumptionComparisonTable.total)} source meter row(s)` },
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
  if (summaryLoading) {
    return <WorkspaceState title="Preparing management reports" detail="Retrieving current billing, collections, customer, and field reporting measures." />;
  }
  if (summaryError) {
    return <WorkspaceState state="error" title="Management reports could not load" detail={summaryError} onRetry={loadSummary} />;
  }
  if (!data || !totals) {
    return <WorkspaceState state="error" title="Management reports are unavailable" detail="No reporting summary was returned. Retry when the service is available." onRetry={loadSummary} />;
  }

  return (
    <section className="page-stack performance-reporting-page">
      <header className="page-header performance-reporting-header">
        <div>
          <p className="eyebrow">Management</p>
          <h2>Management intelligence</h2>
          <p>Track cash, arrears, delivery, and field exposure before they become a month-end surprise.</p>
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
      {hasMonthlyBudgetFocus ? (
        <FocusNotice
          title="Monthly budget control"
          detail="Review the current revenue, collection, and operating-cost variances, then update the recorded target when its approved basis changes."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <ManagementPerformanceMetrics
        accountantTotals={accountantTotals || { approvedPayrollLiability: 0, approvedPayrollRuns: 0, overduePayables: 0, payables: 0, unitsBilled: 0 }}
        highPriorityQualityCount={highQualityIssueCount}
        money={money}
        number={number}
        productionTotals={productionTotals}
        qualityIssueCount={qualityIssueCount}
        totals={totals}
      />

      <div className="management-metric-definition-trigger screen-only">
        <p>Report measures preserve their own reporting basis and open the operating surface that can improve the result.</p>
        <button className="icon-button" type="button" onClick={() => setMetricDefinitionsOpen((current) => !current)} title="Review report metric definitions" aria-label="Review report metric definitions" aria-expanded={metricDefinitionsOpen}><Info size={16} /></button>
      </div>

      {metricDefinitionsOpen ? (
        <ManagementMetricDefinitions
          description="These operational measures use the selected report period where stated. Production, field, payroll, and supplier figures remain distinct instead of being combined into an untraceable total."
          metrics={reportMetrics}
          onClose={() => setMetricDefinitionsOpen(false)}
          onNavigate={onNavigate}
          title="Management report definitions"
        />
      ) : null}

      <CashFlowForecastPanel
        forecast={cashFlowForecast}
        money={money}
        moneyOrDash={moneyOrDash}
        number={number}
        percent={percent}
        sumRows={sumRows}
      />

      <MonthlyBudgetControl
        attentionCount={budgetAttentionCount}
        budgetForm={budgetForm}
        budgetMessage={budgetMessage}
        budgetRows={budgetRows}
        budgetSaving={budgetSaving}
        canManage={canManageMonthlyBudget}
        currentBudget={currentBudget}
        monthLabel={monthLabel}
        money={money}
        monthlyForecastBaseline={monthlyForecastBaseline}
        number={number}
        onApplyForecastBaseline={applyForecastBudgetBaseline}
        onChange={(field, value) => setBudgetForm((current) => ({ ...current, [field]: value }))}
        onSave={saveMonthlyBudget}
      />

      <DataQualityPanel
        highPriorityCount={highQualityIssueCount}
        issueCount={qualityIssueCount}
        label={label}
        number={number}
        onSelect={setSelectedQualityKey}
        reviewableCount={reviewableQualityCount}
        selectedCheck={selectedQuality}
        selectedColumns={selectedQualityColumns}
        selectedRecords={selectedQualityRecords}
        visibleChecks={visibleDataQuality}
      />

      <ReportCatalog
        activeKey={activeManagementReport}
        description="Open a report for review or print it directly. Print all remains available from the page header."
        items={managementReportCatalog}
        onPrint={(target) => printReport("management", target)}
        onSelect={setActiveManagementReport}
        title="Management Report Catalog"
      />

      <div className={`print-surface report-print report-print-management report-print-${printTarget} ${printScope === "management" ? "active-print-surface" : ""}`}>
        <ReportPrintHeader
          assetUrl={assetUrl}
          businessSettings={businessSettings}
          printedAt={date(new Date().toISOString())}
          reportPeriod={`As at ${date(new Date().toISOString())}`}
          reportTitle={managementPrintTitle}
        />

        <ReportSummaryCards
          items={[
            { label: "Billed", value: money(totals.billed), detail: "Last 12 billing periods" },
            { label: "Collected", value: money(totals.collected), detail: "Recent posted receipts" },
            { label: "Outstanding", value: money(totals.arrears), detail: "Open balances" },
            { label: "Customers owing", value: number(totals.openCustomers), detail: "Accounts with arrears" },
            { label: "Maintenance active", value: number(totals.maintenanceActive), detail: "Open and in progress" },
            { label: "Maintenance urgent", value: number(totals.maintenanceUrgent), detail: "Active urgent requests" },
            { label: "Maintenance overdue", value: number(totals.maintenanceOverdue), detail: "Past target date" },
            { label: "Resolved 30d", value: number(totals.maintenanceResolved30d), detail: "Closed recently" }
          ]}
        />

      <section className="report-grid">
        <ManagementRevenueReports
          agingRows={data.agingSummary}
          agingTotals={agingSummaryTotals}
          billingRows={data.billingSummary}
          billingTotals={billingSummaryTotals}
          collectionsRows={data.collectionsSummary}
          collectionsTotals={collectionsSummaryTotals}
          date={date}
          isVisible={showManagementReport}
          money={money}
          number={number}
          onPrint={(target) => printReport("management", target)}
          routeRows={data.zoneReadingSummary}
          routeTotals={zoneReadingTotals}
        />

        <ManagementMaintenanceReports
          assigneeTotals={maintenanceAssigneeTotals}
          byAssigneeRows={data.maintenanceByAssignee || []}
          byCategoryRows={data.maintenanceByCategory || []}
          byStatusRows={data.maintenanceByStatus || []}
          byZoneRows={data.maintenanceByZone || []}
          categoryTotals={maintenanceCategoryTotals}
          isVisible={showManagementReport}
          label={label}
          number={number}
          onPrint={(target) => printReport("management", target)}
          statusTotals={maintenanceStatusTotals}
          zoneTotals={maintenanceZoneTotals}
        />

        <div className={reportSectionClass("panel full-span management-section management-section-maintenanceRegister", showManagementReport("maintenanceRegister"))}>
          <ReportPanelHeading title="Maintenance Register" printLabel="maintenance register" onPrint={() => printReport("management", "maintenanceRegister")} />
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

        <ManagementCustomerReports
          balanceRows={customerBalanceRows}
          balanceTable={customerBalanceTable}
          balanceTotals={customerBalanceTotals}
          clientRows={clientFinancialSummaryRows}
          clientTable={clientFinancialSummaryTable}
          clientTotals={clientFinancialSummaryTotals}
          date={date}
          isVisible={showManagementReport}
          money={money}
          moneyOrDash={moneyOrDash}
          number={number}
          onPrint={(target) => printReport("management", target)}
          statusKey={statusKey}
        />
      </section>
        <div className="report-print-footer">
          {businessSettings?.report_footer_note ? <p>{businessSettings.report_footer_note}</p> : null}
          <small>{businessSettings?.business_name || "Water Billing"} management reports</small>
        </div>
      </div>

      <section className="page-stack accounting-insight-section">
        <header className="page-header accounting-insight-header">
          <div>
            <p className="eyebrow">Accountant</p>
            <h2>Finance performance</h2>
            <p>Review cash performance, operating costs, receivables, and payables for the selected reporting period.</p>
          </div>
          <form className="filter-bar report-period-filter" onSubmit={handleFilterSubmit}>
            <label>
              Saved period
              <select value={periodPreset} onChange={handlePeriodPresetChange}>
                {reportPeriodPresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
              </select>
            </label>
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

        {accountantMessage && accountantData && accountantTotals ? (
          <WorkspaceState state="error" title="Accounting data was not refreshed" detail={accountantMessage} onRetry={() => loadAccountantReports(filters)} />
        ) : null}
        {accountantData && accountantTotals ? (
          <ReportCatalog
            activeKey={activeAccountantReport}
            description="Open a report for review or print it directly."
            items={accountantReportCatalog}
            onPrint={(target) => printReport("accountant", target)}
            onSelect={setActiveAccountantReport}
            title="Accountant Report Catalog"
            variant="accounting-report-catalog-panel"
          />
        ) : null}
        {!accountantData || !accountantTotals ? (
          accountantMessage ? (
            <WorkspaceState state="error" title="Accounting reports could not load" detail={accountantMessage} onRetry={() => loadAccountantReports(filters)} />
          ) : (
            <WorkspaceState title="Preparing accounting reports" detail={accountantLoading ? "Retrieving the selected period's billing, collections, cost, and payables measures." : "Refreshing the selected reporting period."} />
          )
        ) : (
          <div className={`print-surface report-print report-print-accountant report-print-${printTarget} ${printScope === "accountant" ? "active-print-surface" : ""}`}>
            <ReportPrintHeader
              assetUrl={assetUrl}
              businessSettings={businessSettings}
              printedAt={date(new Date().toISOString())}
              reportPeriod={`${date(accountantData.reportPeriod.start_date)} to ${date(accountantData.reportPeriod.end_date)}`}
              reportTitle={accountantPrintTitle}
            />

            <ReportSummaryCards
              items={[
                { label: "Period billed", value: money(accountantTotals.billed), detail: "Billing register total" },
                { label: "Period collected", value: money(accountantTotals.collected), detail: "Posted receipts" },
                { label: "Period balance", value: money(accountantTotals.outstanding), detail: "Bill balances" },
                { label: "Service charges", value: money(accountantTotals.serviceCharges), detail: "Chargeable customer services" },
                { label: "Period expenses", value: money(accountantTotals.expenses), detail: "Operating costs" },
                { label: "Open payables", value: money(accountantTotals.payables), detail: "Contractor invoices not posted/paid" },
                { label: "Overdue payables", value: money(accountantTotals.overduePayables), detail: "Past due contractor invoices" },
                { label: "Cash net profit", value: money(cashProfit.totals?.net_profit), detail: `Margin ${percent(cashProfit.totals?.margin)}` },
                { label: "Accrual net profit", value: money(accrualProfit.totals?.net_profit), detail: `Margin ${percent(accrualProfit.totals?.margin)}` }
              ]}
            />

            <section className="report-grid">
              <div className={reportSectionClass("full-span report-section report-section-profitLoss", showAccountantReport("profitLoss"))}>
                <ReportPanelHeading title="Profit And Loss" printLabel="profit and loss" onPrint={() => printReport("accountant", "profitLoss")} />
                <div className="profit-loss-grid">
                  <ProfitStatement
                    money={money}
                    onPrint={() => printReport("accountant", "cashProfitLoss")}
                    percent={percent}
                    statement={cashProfit}
                    title="Cash Basis"
                    variant="cash"
                  />
                  <ProfitStatement
                    money={money}
                    onPrint={() => printReport("accountant", "accrualProfitLoss")}
                    percent={percent}
                    statement={accrualProfit}
                    title="Accrual Basis"
                    variant="accrual"
                  />
                </div>
              </div>

              <AccountingRevenueReports
                billingByStatusRows={accountantData.billingByStatus || []}
                billingByStatusTotals={billingByStatusTotals}
                billingByZoneRows={accountantData.billingByZone || []}
                billingByZoneTotals={billingByZoneTotals}
                collectionsByChannelRows={accountantData.collectionsByChannel || []}
                collectionsByChannelTotals={collectionsByChannelTotals}
                isVisible={showAccountantReport}
                label={label}
                money={money}
                number={number}
                onPrint={(target) => printReport("accountant", target)}
              />

              <AccountingBillingOperationsReports
                billingRows={billingRegisterRows}
                billingTable={billingRegisterTable}
                billingTotals={billingRegisterTotals}
                date={date}
                isVisible={showAccountantReport}
                label={label}
                meterRows={meterConsumptionComparisonRows}
                meterTable={meterConsumptionComparisonTable}
                meterTotals={meterConsumptionComparisonTotals}
                money={money}
                number={number}
                onPrint={(target) => printReport("accountant", target)}
                percent={percent}
                serviceRows={serviceChargeRows}
                serviceTable={serviceChargeRegisterTable}
                serviceTotals={serviceChargeRegisterTotals}
              />

              <AccountingCollectionsControlReports
                agingRows={receivablesAgingRows}
                agingTable={receivablesAgingTable}
                agingTotals={receivablesAgingTotals}
                allocationRows={allocationLedgerRows}
                allocationTable={allocationLedgerTable}
                allocationTotals={allocationLedgerTotals}
                date={date}
                isVisible={showAccountantReport}
                label={label}
                money={money}
                number={number}
                onPrint={(target) => printReport("accountant", target)}
                receiptRows={receiptRegisterRows}
                receiptTable={receiptRegisterTable}
                receiptTotals={receiptRegisterTotals}
              />

              <AccountingCloseSupportReports
                date={date}
                depositRows={depositRegisterRows}
                depositTable={depositRegisterTable}
                depositTotals={depositRegisterTotals}
                expenseCategoryRows={accountantData.expensesByCategory || []}
                expenseCategoryTotals={expenseCategoryTotals}
                expenseRows={expenseRegisterRows}
                expenseTable={expenseRegisterTable}
                expenseTotals={expenseRegisterTotals}
                isVisible={showAccountantReport}
                label={label}
                money={money}
                number={number}
                onPrint={(target) => printReport("accountant", target)}
              />

              <div className={reportSectionClass("panel full-span report-section report-section-contractorPayables", showAccountantReport("contractorPayables"))}>
                <ReportPanelHeading title="Contractor Payables" printLabel="contractor payables" onPrint={() => printReport("accountant", "contractorPayables")} />
                <ContractorPayablesReport
                  agingRows={accountantData.contractorPayablesAging}
                  agingTotals={contractorPayablesAgingTotals}
                  byStatusRows={accountantData.contractorPayablesByStatus}
                  byStatusTotals={contractorPayablesByStatusTotals}
                  label={label}
                  money={money}
                  number={number}
                  totals={accountantData.contractorPayablesTotals}
                />
              </div>

              <AccountingContractorLedgerReports
                balanceRows={contractorBalanceRows}
                balanceTable={contractorBalanceTable}
                balanceTotals={contractorBalanceTotals}
                date={date}
                invoiceRows={contractorInvoiceRows}
                invoiceTable={contractorInvoiceTable}
                invoiceTotals={contractorInvoiceRegisterTotals}
                isVisible={showAccountantReport}
                label={label}
                money={money}
                number={number}
                onPrint={(target) => printReport("accountant", target)}
              />
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
