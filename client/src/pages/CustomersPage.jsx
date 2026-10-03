import { useEffect, useState } from "react";
import CustomerAccountClosurePanel from "../components/CustomerAccountClosurePanel";
import Customer360Panel from "../components/Customer360Panel";
import CustomerImportWorkspaces from "../components/CustomerImportWorkspaces";
import CustomerManagementWorkspace from "../components/CustomerManagementWorkspace";
import CustomerServiceChargesPanel from "../components/CustomerServiceChargesPanel";
import CustomerStatementWorkspace from "../components/CustomerStatementWorkspace";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import { downloadCsvRows, downloadCsvTemplate } from "../utils/csvTemplate";
import { namedExport, withPrintTitle } from "../utils/exportNames";
import useScopedDraft from "../utils/useScopedDraft";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const moneyAbs = (value) => `KES ${Math.abs(Number(value || 0)).toLocaleString()}`;
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
const sameValue = (left, right) => String(left ?? "") === String(right ?? "");
const createCustomerFilters = () => ({ status: "", zone: "", delivery: "all" });

const deliveryStateFor = (customer) => {
  const enabledChannels = [
    ["email", customer.email_delivery_enabled !== false, customer.email],
    ["sms", Boolean(customer.sms_delivery_enabled), customer.phone],
    ["whatsapp", Boolean(customer.whatsapp_delivery_enabled), customer.phone]
  ];
  const enabled = enabledChannels.filter(([, isEnabled]) => isEnabled);
  if (!enabled.length) return { key: "opted_out", label: "Opted out" };
  const preferred = customer.preferred_delivery_channel || "email";
  const preferredChannel = enabledChannels.find(([channel]) => channel === preferred);
  if (preferredChannel?.[1] && String(preferredChannel[2] || "").trim()) return { key: "ready", label: "Ready" };
  if (enabled.some(([, , contact]) => String(contact || "").trim())) return { key: "ready", label: "Ready" };
  return { key: "needs_contact", label: "Needs contact" };
};

const blank = {
  name: "",
  phone: "",
  email: "",
  acc_number: "",
  rate_id: "",
  zone_id: "",
  deposit_amount: "",
  deposit_paid: false,
  opening_balance_amount: "",
  opening_balance_date: "",
  preferred_delivery_channel: "email",
  email_delivery_enabled: true,
  sms_delivery_enabled: false,
  whatsapp_delivery_enabled: false
};

const customerImportHeaders = [
  "name",
  "acc_number",
  "phone",
  "email",
  "rate_name",
  "zone_name",
  "deposit_amount",
  "deposit_paid",
  "deposit_paid_at",
  "opening_balance_amount",
  "opening_balance_date",
  "status",
  "preferred_delivery_channel",
  "email_delivery_enabled",
  "sms_delivery_enabled",
  "whatsapp_delivery_enabled"
];

const openingBalanceImportHeaders = ["acc_number", "opening_balance_amount", "opening_balance_date"];

const serviceChargeBlank = {
  charge_type: "other",
  description: "",
  amount: "",
  charge_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  notes: ""
};

const serviceChargeTypes = [
  ["meter_replacement", "Meter replacement"],
  ["reconnection", "Reconnection"],
  ["new_connection", "New connection"],
  ["inspection", "Inspection"],
  ["repair", "Repair"],
  ["water_delivery", "Water delivery"],
  ["admin_fee", "Admin fee"],
  ["other", "Other"]
];

const financialAccountFields = new Set([
  "rate_id",
  "deposit_amount",
  "deposit_paid",
  "deposit_paid_at",
  "opening_balance_amount",
  "opening_balance_date"
]);

function CustomersPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [rates, setRates] = useState([]);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(blank);
  const [deliveryPreferenceReason, setDeliveryPreferenceReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [customerReview, setCustomerReview] = useState(null);
  const [customerReviewBusy, setCustomerReviewBusy] = useState(false);
  const [customerDeleteReview, setCustomerDeleteReview] = useState(null);
  const [customerDeleteReviewBusy, setCustomerDeleteReviewBusy] = useState(false);
  const [importReview, setImportReview] = useState(null);
  const [importReviewBusy, setImportReviewBusy] = useState(false);
  const [business, setBusiness] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [statementStart, setStatementStart] = useState("");
  const [statementEnd, setStatementEnd] = useState("");
  const [statement, setStatement] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [openingCsvText, setOpeningCsvText] = useState("");
  const [openingImportPreview, setOpeningImportPreview] = useState(null);
  const [customerFilters, setCustomerFilters] = useScopedDraft(user, "customer-register-filters", createCustomerFilters, { storage: "local" });
  const statusFilter = customerFilters.status || "";
  const zoneFilter = customerFilters.zone || "";
  const deliveryFilter = customerFilters.delivery || "all";
  const setCustomerFilter = (field, value) => setCustomerFilters((current) => ({ ...current, [field]: value }));
  const setStatusFilter = (value) => setCustomerFilter("status", value);
  const setZoneFilter = (value) => setCustomerFilter("zone", value);
  const setDeliveryFilter = (value) => setCustomerFilter("delivery", value);
  const [closingCustomer, setClosingCustomer] = useState(null);
  const [serviceChargeCustomer, setServiceChargeCustomer] = useState(null);
  const [serviceCharges, setServiceCharges] = useState([]);
  const [serviceChargeForm, setServiceChargeForm] = useState(serviceChargeBlank);
  const [loadingServiceCharges, setLoadingServiceCharges] = useState(false);
  const [serviceChargeReview, setServiceChargeReview] = useState(null);
  const [serviceChargeReviewBusy, setServiceChargeReviewBusy] = useState(false);
  const [closureForm, setClosureForm] = useState({
    settlement_date: new Date().toISOString().slice(0, 10),
    apply_deposit: true,
    deposit_remainder_action: "refund",
    transfer_customer_id: "",
    notes: ""
  });
  const [closureReview, setClosureReview] = useState(null);
  const [closureReviewBusy, setClosureReviewBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [, setMessage] = useToastMessage();
  const canWrite = ["admin", "accountant"].includes(user.role);

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const [customerRows, rateRows, zoneRows, businessSettings] = await Promise.all([
        api.customers.list(),
        api.rates.list(),
        api.zones.list(),
        api.businessSettings.get().catch(() => null)
      ]);
      setCustomers(customerRows);
      setRates(rateRows);
      setZones(zoneRows);
      setBusiness(businessSettings);
    } catch (err) {
      if (showState) setInitialError(err.message || "Customer records and setup data could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (navigationIntent?.page !== "customers" || navigationIntent.focus !== "customer_360" || !navigationIntent.customer_id) return;
    const customer = customers.find((row) => Number(row.id) === Number(navigationIntent.customer_id))
      || navigationIntent.customer_snapshot;
    if (customer) {
      setSelectedCustomer((current) => (
        Number(current?.id) === Number(customer.id) ? current : customer
      ));
    }
  }, [customers, navigationIntent]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setDeliveryChannel = (channel, enabled) => {
    const field = `${channel}_delivery_enabled`;
    setForm((current) => {
      const next = { ...current, [field]: enabled };
      if (!enabled && current.preferred_delivery_channel === channel) {
        const fallback = ["email", "sms", "whatsapp"].find((option) => option !== channel && Boolean(next[`${option}_delivery_enabled`]));
        if (fallback) next.preferred_delivery_channel = fallback;
      }
      return next;
    });
  };

  const saveCustomer = async (payload, reviewNotes = "") => {
    try {
      const reviewedPayload = reviewNotes ? { ...payload, review_notes: reviewNotes } : payload;
      if (editingId) {
        await api.customers.update(editingId, reviewedPayload);
      } else {
        await api.customers.create(reviewedPayload);
      }
      setForm(blank);
      setDeliveryPreferenceReason("");
      setEditingId(null);
      setEntryOpen(false);
      await load();
      setMessage("Customer saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setMessage("");
    const duplicate = customers.find(
      (customer) =>
        customer.acc_number.toLowerCase() === form.acc_number.toLowerCase() && customer.id !== editingId
    );
    if (duplicate) {
      setMessage("That account number is already in use.");
      return;
    }

    const normalizedPayload = {
      ...form,
      rate_id: Number(form.rate_id),
      zone_id: Number(form.zone_id),
      deposit_amount: Number(form.deposit_amount || 0),
      deposit_paid: Boolean(form.deposit_paid),
      opening_balance_amount: Number(form.opening_balance_amount || 0),
      opening_balance_date: Number(form.opening_balance_amount || 0) !== 0 ? form.opening_balance_date : null
    };
    const existingCustomer = editingId ? customers.find((customer) => Number(customer.id) === Number(editingId)) : null;
    let payload = existingCustomer
      ? Object.fromEntries(
          Object.entries(normalizedPayload).filter(([field, value]) => {
            if (field === "opening_balance_date") {
              return !sameValue(value, existingCustomer.opening_balance_date?.slice(0, 10) || null);
            }
            if (["rate_id", "zone_id"].includes(field)) {
              return Number(value) !== Number(existingCustomer[field]);
            }
            if (["deposit_amount", "opening_balance_amount"].includes(field)) {
              return Number(value || 0) !== Number(existingCustomer[field] || 0);
            }
            if (["deposit_paid", "email_delivery_enabled", "sms_delivery_enabled", "whatsapp_delivery_enabled"].includes(field)) {
              return Boolean(value) !== Boolean(existingCustomer[field]);
            }
            return !sameValue(value, existingCustomer[field]);
          })
        )
      : normalizedPayload;
    if (editingId && !Object.keys(payload).length) {
      setMessage("No customer changes detected.");
      return;
    }

    const deliveryPreferenceChanged = editingId && [
      "preferred_delivery_channel",
      "email_delivery_enabled",
      "sms_delivery_enabled",
      "whatsapp_delivery_enabled"
    ].some((field) => Object.hasOwn(payload, field));
    if (deliveryPreferenceChanged) {
      const reason = deliveryPreferenceReason.trim();
      if (!reason) {
        setMessage("Record the customer request or operational reason before changing delivery preferences.");
        return;
      }
      payload = { ...payload, delivery_preference_reason: reason };
    }

    const needsReview = !editingId || Object.keys(payload).some((field) => financialAccountFields.has(field));
    if (needsReview) {
      setCustomerReview({ mode: editingId ? "update" : "create", existingCustomer, payload });
      return;
    }
    saveCustomer(payload);
  };

  const confirmCustomerReview = async (reviewNotes) => {
    if (!customerReview) return;
    setCustomerReviewBusy(true);
    try {
      await saveCustomer(customerReview.payload, reviewNotes);
      setCustomerReview(null);
    } finally {
      setCustomerReviewBusy(false);
    }
  };

  const edit = (customer) => {
    setEditingId(customer.id);
    setEntryOpen(true);
    setDeliveryPreferenceReason("");
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      acc_number: customer.acc_number || "",
      rate_id: customer.rate_id || "",
      zone_id: customer.zone_id || "",
      deposit_amount: customer.deposit_amount || "",
      deposit_paid: Boolean(customer.deposit_paid),
      opening_balance_amount: customer.opening_balance_amount || "",
      opening_balance_date: customer.opening_balance_date ? customer.opening_balance_date.slice(0, 10) : "",
      preferred_delivery_channel: customer.preferred_delivery_channel || "email",
      email_delivery_enabled: customer.email_delivery_enabled !== false,
      sms_delivery_enabled: Boolean(customer.sms_delivery_enabled),
      whatsapp_delivery_enabled: Boolean(customer.whatsapp_delivery_enabled)
    });
  };

  const remove = (customer) => {
    setCustomerDeleteReview(customer);
  };

  const setEntryPanelOpen = (open) => {
    setEntryOpen(open);
    if (!open) {
      setForm(blank);
      setDeliveryPreferenceReason("");
      setEditingId(null);
    }
  };

  const confirmCustomerDeletion = async (reviewNotes) => {
    if (!customerDeleteReview) return;
    setCustomerDeleteReviewBusy(true);
    try {
      await api.customers.remove(customerDeleteReview.id, { review_notes: reviewNotes });
      await load();
      setCustomerDeleteReview(null);
      setMessage("Customer deleted.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setCustomerDeleteReviewBusy(false);
    }
  };

  const openStatement = (customer) => {
    setStatementCustomer(customer);
    setStatement(null);
    setStatementStart("");
    setStatementEnd("");
    setMessage("");
  };

  const generateStatement = async (mode = "period") => {
    if (!statementCustomer) return;
    setMessage("");
    try {
      const params =
        mode === "lifetime"
          ? {}
          : {
              ...(statementStart ? { start_date: statementStart } : {}),
              ...(statementEnd ? { end_date: statementEnd } : {})
            };
      const result = await api.customers.statement(statementCustomer.id, params);
      setStatement(result);
      setMessage("Customer statement generated.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const printStatement = () => {
    if (!statement) return;
    withPrintTitle(
      `customer statement ${statement.customer.acc_number} ${statement.period.lifetime ? "lifetime" : `${statement.period.start_date || "start"} to ${statement.period.end_date || "end"}`}`,
      () => window.print(),
      business
    );
  };

  const previewImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.customers.previewImport(csvText);
      setImportPreview(preview);
      setMessage(`Preview ready: ${preview.summary.valid} valid, ${preview.summary.invalid} invalid.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const commitImport = () => {
    if (!importReady) return;
    setImportReview({ kind: "customers", preview: importPreview });
  };

  const executeCustomerImport = async (reviewNotes) => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.customers.commitImport(csvText, reviewNotes);
      setCsvText("");
      setImportPreview(null);
      await load();
      setMessage(`${result.inserted} customers imported.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const importReady = importPreview?.summary?.valid > 0 && importPreview?.summary?.invalid === 0;
  const openingImportReady =
    openingImportPreview?.summary?.valid > 0 && openingImportPreview?.summary?.invalid === 0;
  const filteredCustomers = customers.map((customer) => ({ ...customer, delivery_state: deliveryStateFor(customer) })).filter((customer) => {
    const statusMatch = !statusFilter || customer.status === statusFilter;
    const zoneMatch = !zoneFilter || Number(customer.zone_id) === Number(zoneFilter);
    const deliveryMatch = deliveryFilter === "all" || customer.delivery_state.key === deliveryFilter;
    return statusMatch && zoneMatch && deliveryMatch;
  });
  const customerTable = useTableControls(filteredCustomers, {
    storageKey: `customer-register:${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`,
    searchFields: ["name", "acc_number", "phone", "email", "zone_name", "location", "rate_name", "status", "preferred_delivery_channel"]
  });

  if (initialLoading) {
    return <WorkspaceState title="Preparing customer accounts" detail="Retrieving customer records, tariffs, zones, and account controls." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Customer accounts could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }

  const exportCustomers = () => {
    downloadCsvRows(
      namedExport("customer-register", "csv", [
        statusFilter || "all-statuses",
        zoneFilter ? zones.find((zone) => Number(zone.id) === Number(zoneFilter))?.name : "all-zones",
        deliveryFilter
      ]),
      [
        { header: "Account", value: (row) => row.acc_number },
        { header: "Name", value: (row) => row.name },
        { header: "Phone", value: (row) => row.phone },
        { header: "Email", value: (row) => row.email },
        { header: "Zone", value: (row) => row.zone_name || row.location },
        { header: "Rate", value: (row) => row.rate_name },
        { header: "Preferred Delivery", value: (row) => row.preferred_delivery_channel },
        { header: "Delivery State", value: (row) => row.delivery_state?.label || "-" },
        { header: "Email Delivery", value: (row) => (row.email_delivery_enabled ? "yes" : "no") },
        { header: "SMS Delivery", value: (row) => (row.sms_delivery_enabled ? "yes" : "no") },
        { header: "WhatsApp Delivery", value: (row) => (row.whatsapp_delivery_enabled ? "yes" : "no") },
        { header: "Deposit", value: (row) => row.deposit_amount },
        { header: "Deposit Paid", value: (row) => (row.deposit_paid ? "yes" : "no") },
        { header: "Opening Balance", value: (row) => row.opening_balance_amount },
        { header: "Balance Due", value: (row) => row.balance_due },
        { header: "Status", value: (row) => row.status }
      ],
      customerTable.filteredRows
    );
  };

  const setClosureField = (field, value) =>
    setClosureForm((current) => ({ ...current, [field]: value }));

  const closeAccount = () => {
    if (!closingCustomer) return;
    setClosureReview({ ...closureForm });
  };

  const confirmAccountClosure = async (reviewNotes) => {
    if (!closingCustomer || !closureReview) return;
    setMessage("");
    setClosureReviewBusy(true);
    try {
      await api.customers.closeAccount(closingCustomer.id, { ...closureReview, review_notes: reviewNotes });
      setClosingCustomer(null);
      setClosureReview(null);
      setClosureForm({
        settlement_date: new Date().toISOString().slice(0, 10),
        apply_deposit: true,
        deposit_remainder_action: "refund",
        transfer_customer_id: "",
        notes: ""
      });
      await load();
      setMessage("Customer account closed. Payments can still be accepted if debt remains.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setClosureReviewBusy(false);
    }
  };

  const loadServiceCharges = async (customer) => {
    if (!customer) return;
    setLoadingServiceCharges(true);
    try {
      const rows = await api.customerServiceCharges.list({ customer_id: customer.id });
      setServiceCharges(rows);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoadingServiceCharges(false);
    }
  };

  const openServiceCharges = async (customer) => {
    setServiceChargeCustomer(customer);
    setServiceChargeForm({
      ...serviceChargeBlank,
      charge_date: new Date().toISOString().slice(0, 10)
    });
    setServiceCharges([]);
    setMessage("");
    await loadServiceCharges(customer);
  };

  const setServiceChargeField = (field, value) =>
    setServiceChargeForm((current) => ({ ...current, [field]: value }));

  const submitServiceCharge = (event) => {
    event.preventDefault();
    if (!serviceChargeCustomer) return;
    setServiceChargeReview({
      action: "post",
      payload: {
        ...serviceChargeForm,
        customer_id: serviceChargeCustomer.id,
        amount: Number(serviceChargeForm.amount || 0),
        due_date: serviceChargeForm.due_date || serviceChargeForm.charge_date
      }
    });
  };

  const postServiceCharge = async (payload, reviewNotes) => {
    setMessage("");
    try {
      await api.customerServiceCharges.create({ ...payload, review_notes: reviewNotes });
      setServiceChargeForm({
        ...serviceChargeBlank,
        charge_date: new Date().toISOString().slice(0, 10)
      });
      await Promise.all([load(), loadServiceCharges(serviceChargeCustomer)]);
      setMessage("Customer service charge posted as payable.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const waiveServiceCharge = async (charge) => {
    setServiceChargeReview({ action: "waive", charge });
  };

  const cancelServiceCharge = async (charge) => {
    setServiceChargeReview({ action: "cancel", charge });
  };

  const confirmServiceChargeReview = async (reason) => {
    if (!serviceChargeReview) return;
    setMessage("");
    setServiceChargeReviewBusy(true);
    try {
      const { action, charge } = serviceChargeReview;
      if (action === "post") {
        await postServiceCharge(serviceChargeReview.payload, reason);
        setServiceChargeReview(null);
        return;
      }
      await api.customerServiceCharges[action](charge.id, reason);
      await Promise.all([load(), loadServiceCharges(serviceChargeCustomer)]);
      setServiceChargeReview(null);
      setMessage(action === "waive" ? "Service charge waived." : "Service charge cancelled.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setServiceChargeReviewBusy(false);
    }
  };

  const previewOpeningBalanceImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.customers.previewOpeningBalanceImport(openingCsvText);
      setOpeningImportPreview(preview);
      setMessage(`Opening balance preview ready: ${preview.summary.valid} valid, ${preview.summary.invalid} invalid.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleOpeningCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOpeningCsvText(await file.text());
    setOpeningImportPreview(null);
  };

  const commitOpeningBalanceImport = () => {
    if (!openingImportReady) return;
    setImportReview({ kind: "opening_balances", preview: openingImportPreview });
  };

  const executeOpeningBalanceImport = async (reviewNotes) => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.customers.commitOpeningBalanceImport(openingCsvText, reviewNotes);
      setOpeningCsvText("");
      setOpeningImportPreview(null);
      await load();
      setMessage(`${result.updated} opening balance(s) overwritten.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const confirmImportReview = async (reviewNotes) => {
    if (!importReview) return;
    setImportReviewBusy(true);
    try {
      if (importReview.kind === "customers") {
        await executeCustomerImport(reviewNotes);
      } else {
        await executeOpeningBalanceImport(reviewNotes);
      }
      setImportReview(null);
    } finally {
      setImportReviewBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Customers</h2>
        </div>
      </header>
      {navigationIntent?.page === "customers" && navigationIntent.focus === "customer_360" ? (
        <FocusNotice title="Customer account review" detail="Showing the selected customer account and its financial and service history." onClear={onClearNavigationIntent} />
      ) : null}

      {canWrite && selectedCustomer ? (
        <Customer360Panel
          customer={selectedCustomer}
          initialTab={navigationIntent?.page === "customers" && navigationIntent.focus === "customer_360" ? navigationIntent.customer_360_tab : undefined}
          onClose={() => setSelectedCustomer(null)}
          onEdit={(customer) => {
            edit(customer);
            setSelectedCustomer(null);
          }}
          onNavigate={onNavigate}
          onStatement={(customer) => {
            openStatement(customer);
            setSelectedCustomer(null);
          }}
          onServiceCharges={(customer) => {
            openServiceCharges(customer);
            setSelectedCustomer(null);
          }}
          onCloseAccount={(customer) => {
            setClosingCustomer(customer);
            setSelectedCustomer(null);
          }}
        />
      ) : null}

      {!selectedCustomer ? <CustomerManagementWorkspace
        accountPositionLabel={accountPositionLabel}
        busy={customerReviewBusy || Boolean(customerReview)}
        canWrite={canWrite}
        customerTable={customerTable}
        deliveryFilter={deliveryFilter}
        deliveryPreferenceReason={deliveryPreferenceReason}
        editingId={editingId}
        entryOpen={entryOpen}
        form={form}
        money={money}
        moneyAbs={moneyAbs}
        onCloseAccount={setClosingCustomer}
        onEdit={edit}
        onEntryOpenChange={setEntryPanelOpen}
        onExport={exportCustomers}
        onFieldChange={setField}
        onDeliveryFilterChange={setDeliveryFilter}
        onDeliveryPreferenceReasonChange={setDeliveryPreferenceReason}
        onDeliveryChannelChange={setDeliveryChannel}
        onOpenServiceCharges={openServiceCharges}
        onOpenStatement={openStatement}
        onRemove={remove}
        onSelectCustomer={setSelectedCustomer}
        onStatusChange={setStatusFilter}
        onSubmit={submit}
        onZoneChange={setZoneFilter}
        rates={rates}
        statusFilter={statusFilter}
        userRole={user.role}
        zoneFilter={zoneFilter}
        zones={zones}
      /> : null}

      <CustomerImportWorkspaces
        canWrite={canWrite}
        customerCsvText={csvText}
        customerImportReady={importReady}
        customerPreview={importPreview}
        importing={importing || importReviewBusy || Boolean(importReview)}
        onCommitCustomerImport={commitImport}
        onCommitOpeningImport={commitOpeningBalanceImport}
        onCustomerFile={handleCsvFile}
        onCustomerTemplate={() => downloadCsvTemplate("customer-import-template.csv", customerImportHeaders)}
        onCustomerTextChange={(value) => { setCsvText(value); setImportPreview(null); }}
        onOpeningFile={handleOpeningCsvFile}
        onOpeningTemplate={() => downloadCsvTemplate("opening-balances-overwrite-template.csv", openingBalanceImportHeaders)}
        onOpeningTextChange={(value) => { setOpeningCsvText(value); setOpeningImportPreview(null); }}
        onPreviewCustomerImport={previewImport}
        onPreviewOpeningImport={previewOpeningBalanceImport}
        openingCsvText={openingCsvText}
        openingImportReady={openingImportReady}
        openingPreview={openingImportPreview}
        show={!selectedCustomer}
      />

      <CustomerAccountClosurePanel
        busy={closureReviewBusy || Boolean(closureReview)}
        canWrite={canWrite}
        customer={closingCustomer}
        customers={customers}
        form={closureForm}
        onCancel={() => setClosingCustomer(null)}
        onCloseAccount={closeAccount}
        onFieldChange={setClosureField}
      />

      <CustomerServiceChargesPanel
        canWrite={canWrite}
        busy={serviceChargeReviewBusy || Boolean(serviceChargeReview)}
        charges={serviceCharges}
        customer={serviceChargeCustomer}
        form={serviceChargeForm}
        loading={loadingServiceCharges}
        money={money}
        onCancel={cancelServiceCharge}
        onClose={() => setServiceChargeCustomer(null)}
        onFieldChange={setServiceChargeField}
        onSubmit={submitServiceCharge}
        onWaive={waiveServiceCharge}
        serviceChargeTypes={serviceChargeTypes}
        userRole={user.role}
      />

      <CustomerStatementWorkspace
        accountPositionLabel={accountPositionLabel}
        business={business}
        canWrite={canWrite}
        money={money}
        moneyAbs={moneyAbs}
        onEndChange={setStatementEnd}
        onGenerate={generateStatement}
        onPrint={printStatement}
        onStartChange={setStatementStart}
        statement={statement}
        statementCustomer={statementCustomer}
        statementEnd={statementEnd}
        statementStart={statementStart}
      />
      <ReviewDialog
        open={Boolean(importReview)}
        eyebrow={importReview?.kind === "customers" ? "Customer import review" : "Opening balance overwrite review"}
        title={importReview?.kind === "customers" ? "Commit customer import" : "Commit opening balance overwrite"}
        description={
          importReview?.kind === "customers"
            ? "This creates the reviewed customer accounts and any required migration bills. It does not post payments or send customer notifications."
            : "This replaces the reviewed opening balances and updates their migration bills. It does not post payments, reverse allocations, or send customer notifications."
        }
        confirmLabel={importReview?.kind === "customers" ? "Commit customer import" : "Commit opening balance overwrite"}
        cancelLabel="Return to preview"
        reasonLabel="Import approval note"
        reasonPlaceholder="Record the source, validation basis, and authority for this batch"
        busy={importReviewBusy}
        busyLabel="Committing import..."
        onCancel={() => !importReviewBusy && setImportReview(null)}
        onConfirm={confirmImportReview}
      >
        {importReview ? (() => {
          const rows = importReview.preview?.rows || [];
          const openingTotal = rows.reduce((sum, row) => sum + Number(row.opening_balance_amount || 0), 0);
          const depositTotal = rows.reduce((sum, row) => sum + Number(row.deposit_amount || 0), 0);
          return (
            <div className="reading-context">
              <div><span>Valid rows</span><strong>{importReview.preview?.summary?.valid || 0}</strong></div>
              <div><span>Invalid rows</span><strong>{importReview.preview?.summary?.invalid || 0}</strong></div>
              <div><span>Opening balance total</span><strong>{money(openingTotal)}</strong></div>
              {importReview.kind === "customers" ? <div><span>Deposit total</span><strong>{money(depositTotal)}</strong></div> : null}
              <div><span>Billing consequence</span><strong>{openingTotal ? "Migration bills will be created or updated for non-zero balances" : "No migration bills from this batch"}</strong></div>
              <div><span>Payments and notifications</span><strong>None posted or sent by this action</strong></div>
            </div>
          );
        })() : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(customerDeleteReview)}
        eyebrow="Permanent deletion review"
        title="Delete customer account"
        description="This permanently deletes the customer record only where no linked records prevent it. Prefer account closure when bills, payments, readings, deposits, or service history must be preserved. This does not reverse, transfer, or delete linked financial records."
        confirmLabel="Delete customer account"
        cancelLabel="Keep customer"
        reasonLabel="Deletion approval note"
        reasonPlaceholder="Record why permanent deletion is approved instead of account closure"
        busy={customerDeleteReviewBusy}
        busyLabel="Deleting customer..."
        danger
        onCancel={() => !customerDeleteReviewBusy && setCustomerDeleteReview(null)}
        onConfirm={confirmCustomerDeletion}
      >
        {customerDeleteReview ? (
          <div className="reading-context">
            <div><span>Customer</span><strong>{customerDeleteReview.name} | {customerDeleteReview.acc_number}</strong></div>
            <div><span>Current status</span><strong>{customerDeleteReview.status || "active"}</strong></div>
            <div><span>Current balance</span><strong>{money(customerDeleteReview.balance_due)}</strong></div>
            <div><span>Alternative</span><strong>Account closure preserves history and settles deposits</strong></div>
            <div><span>Deletion consequence</span><strong>Permanent customer-record deletion only when allowed by linked data</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(customerReview)}
        eyebrow={customerReview?.mode === "create" ? "Account setup review" : "Financial account-change review"}
        title={customerReview?.mode === "create" ? "Create customer account" : "Save customer financial changes"}
        description={
          customerReview?.mode === "create"
            ? "This creates the customer account with the selected tariff, deposit, and opening balance. A non-zero opening balance creates one payable migration bill. It does not post a payment or send a notification."
            : "This updates the customer tariff, deposit, or opening balance. An opening-balance change updates its migration bill. It does not post a payment or send a notification."
        }
        confirmLabel={customerReview?.mode === "create" ? "Create customer account" : "Save financial changes"}
        cancelLabel="Keep editing"
        reasonLabel={customerReview?.mode === "create" ? "Account-setup approval note" : "Financial account-change approval note"}
        reasonPlaceholder="Record the approved account setup or financial change and authority"
        busy={customerReviewBusy}
        busyLabel={customerReview?.mode === "create" ? "Creating customer..." : "Saving customer..."}
        onCancel={() => !customerReviewBusy && setCustomerReview(null)}
        onConfirm={confirmCustomerReview}
      >
        {customerReview ? (() => {
          const customer = { ...(customerReview.existingCustomer || {}), ...customerReview.payload };
          const rate = rates.find((row) => Number(row.id) === Number(customer.rate_id));
          const zone = zones.find((row) => Number(row.id) === Number(customer.zone_id));
          const openingBalance = Number(customer.opening_balance_amount || 0);
          return (
            <div className="reading-context">
              <div><span>Customer</span><strong>{customer.name} | {customer.acc_number}</strong></div>
              <div><span>Zone/location</span><strong>{zone?.name || customer.location || "Not set"}</strong></div>
              <div><span>Tariff</span><strong>{rate ? `${rate.name} | ${money(rate.amount)}` : "Unchanged"}</strong></div>
              <div><span>Deposit</span><strong>{money(customer.deposit_amount)} | {customer.deposit_paid ? "Marked paid" : "Not marked paid"}</strong></div>
              <div><span>Opening balance</span><strong>{money(openingBalance)}{openingBalance ? ` | ${customer.opening_balance_date}` : " | No migration bill"}</strong></div>
              <div><span>Billing consequence</span><strong>{openingBalance ? "One payable migration bill" : "No migration bill"}</strong></div>
              <div><span>Notifications</span><strong>None sent by this action</strong></div>
            </div>
          );
        })() : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(closureReview)}
        eyebrow="Account closure review"
        title="Close customer account"
        description="This marks the account inactive, creates a zero-value closure bill, and applies only the deposit settlement selected below. It does not initiate a bank, cash, or M-Pesa transfer."
        confirmLabel="Close customer account"
        cancelLabel="Keep editing"
        reasonLabel="Closure approval note"
        reasonPlaceholder="Record the approved closure, settlement basis, and authority"
        busy={closureReviewBusy}
        busyLabel="Closing account..."
        danger
        onCancel={() => !closureReviewBusy && setClosureReview(null)}
        onConfirm={confirmAccountClosure}
      >
        {closureReview && closingCustomer ? (() => {
          const balanceDue = Math.max(Number(closingCustomer.balance_due || 0), 0);
          const depositAvailable = closureReview.apply_deposit && closingCustomer.deposit_paid
            ? Math.max(Number(closingCustomer.deposit_amount || 0), 0)
            : 0;
          const depositApplied = Math.min(depositAvailable, balanceDue);
          const depositRemainder = Math.max(depositAvailable - depositApplied, 0);
          const transferCustomer = customers.find((candidate) => Number(candidate.id) === Number(closureReview.transfer_customer_id));
          const remainderLabel = !depositRemainder
            ? "No deposit remainder"
            : closureReview.deposit_remainder_action === "refund"
              ? "Manual-adjustment refund expense"
              : closureReview.deposit_remainder_action === "transfer"
                ? `Manual-adjustment transfer to ${transferCustomer ? `${transferCustomer.name} | ${transferCustomer.acc_number}` : "selected customer"}`
                : "Forfeit remaining deposit";
          return (
            <div className="reading-context">
              <div><span>Customer</span><strong>{closingCustomer.name} | {closingCustomer.acc_number}</strong></div>
              <div><span>Settlement date</span><strong>{closureReview.settlement_date}</strong></div>
              <div><span>Current amount due</span><strong>{money(balanceDue)}</strong></div>
              <div><span>Paid deposit available</span><strong>{money(depositAvailable)}</strong></div>
              <div><span>Deposit applied to bills</span><strong>{money(depositApplied)}</strong></div>
              <div><span>Deposit remainder</span><strong>{money(depositRemainder)} | {remainderLabel}</strong></div>
              <div><span>Service status</span><strong>Inactive after confirmation</strong></div>
              <div><span>Final billing record</span><strong>One zero-value closure bill</strong></div>
            </div>
          );
        })() : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(serviceChargeReview)}
        eyebrow={serviceChargeReview?.action === "post" ? "Customer charge review" : "Customer charge"}
        title={serviceChargeReview?.action === "post" ? "Post customer service charge" : serviceChargeReview?.action === "waive" ? "Waive service charge" : "Cancel service charge"}
        description={
          serviceChargeReview
            ? serviceChargeReview.action === "post"
              ? `This adds a payable customer charge and creates one linked bill. It does not record a payment, collect funds, or send a bill notification.`
              : `${serviceChargeReview.charge.description || "Service charge"} for ${money(serviceChargeReview.charge.amount)}. This change will remain in the customer audit history.`
            : ""
        }
        confirmLabel={serviceChargeReview?.action === "post" ? "Post payable charge" : serviceChargeReview?.action === "waive" ? "Waive charge" : "Cancel charge"}
        cancelLabel={serviceChargeReview?.action === "post" ? "Keep editing" : "Cancel"}
        reasonLabel={serviceChargeReview?.action === "post" ? "Finance approval note" : "Reason"}
        reasonPlaceholder={serviceChargeReview?.action === "post" ? "State the approved service, authority, or reason for adding this customer charge" : "Explain why this customer charge is being changed"}
        busy={serviceChargeReviewBusy}
        danger={serviceChargeReview?.action === "cancel"}
        onCancel={() => setServiceChargeReview(null)}
        onConfirm={confirmServiceChargeReview}
      >
        {serviceChargeReview?.action === "post" ? (
          <div className="reading-context">
            <div><span>Customer</span><strong>{serviceChargeCustomer?.name} | {serviceChargeCustomer?.acc_number}</strong></div>
            <div><span>Charge type</span><strong>{serviceChargeTypes.find(([value]) => value === serviceChargeReview.payload.charge_type)?.[1] || serviceChargeReview.payload.charge_type}</strong></div>
            <div><span>Charge amount</span><strong>{money(serviceChargeReview.payload.amount)}</strong></div>
            <div><span>Charge date</span><strong>{serviceChargeReview.payload.charge_date}</strong></div>
            <div><span>Customer due date</span><strong>{serviceChargeReview.payload.due_date}</strong></div>
            <div><span>Linked bill</span><strong>One new payable bill</strong></div>
            <div><span>Description</span><strong>{serviceChargeReview.payload.description}</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
    </section>
  );
}

export default CustomersPage;
