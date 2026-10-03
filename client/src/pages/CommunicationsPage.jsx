import { Eye, Mail, MessageSquare, Send, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import CampaignRecoveryWorkspace from "../components/CampaignRecoveryWorkspace";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import PaymentPlanFollowUpPanel from "../components/PaymentPlanFollowUpPanel";
import StandingOrderFollowUpPanel from "../components/StandingOrderFollowUpPanel";
import DisconnectionWarningPanel from "../components/DisconnectionWarningPanel";
import DeliveryExceptionPanel from "../components/DeliveryExceptionPanel";
import { api } from "../services/api";
import useScopedDraft from "../utils/useScopedDraft";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? String(value).slice(0, 10) : "-");
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

const mediumOptions = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: Smartphone }
];

const createCommunicationFilters = () => ({
  medium: "email",
  readiness: "all",
  zoneFilter: "",
  recipientOutcome: "all"
});

const contactLabel = (row, medium) => {
  const contact = row.contacts?.[medium];
  if (!contact?.value) return "Missing";
  if (!contact.enabled) return "Disabled";
  return contact.ready ? "Ready" : "Not ready";
};

const renderTemplate = (template, values = {}) =>
  String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    values[key] === undefined || values[key] === null ? "" : String(values[key])
  );

const summarizeTemplate = (template) => {
  const line = String(template || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, "").replace(/[.,:;]+/g, " ").trim())
    .find((item) => item.length >= 4);
  return line || "Invoice alert";
};

const parseTemplateVariables = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const formatTemplateVariables = (value) => (Array.isArray(value) ? value.join(", ") : String(value || ""));

const campaignRecipientTarget = (recipient) => {
  if (campaignDeliveryCause(recipient) === "Delivery opted out" && recipient.customer_id) {
    return { label: "Open account", target: { page: "customers", focus: "customer_360", customer_id: recipient.customer_id, label: "Customer delivery preference" } };
  }
  if (recipient.bill_id) {
    return { label: "Open bill", target: { page: "bills", focus: "bill_detail", bill_id: recipient.bill_id, label: "Campaign bill" } };
  }
  if (recipient.customer_id) {
    return { label: "Open account", target: { page: "customers", focus: "customer_360", customer_id: recipient.customer_id, label: "Customer 360" } };
  }
  return null;
};

const campaignDeliveryCause = (recipient) => {
  const detail = String(recipient.delivery_error_message || recipient.error_message || "").toLowerCase();
  if (/not configured|provider is not configured|missing provider/.test(detail)) return "Provider setup";
  if (/delivery is disabled|delivery disabled|opted out/.test(detail)) return "Delivery opted out";
  if (/missing|does not have|invalid (email|phone|recipient)|recipient.*invalid/.test(detail)) return "Recipient details";
  if (recipient.status === "failed") return "Provider failure";
  return "Review required";
};

const campaignRetryPolicy = (recipient) => {
  const cause = campaignDeliveryCause(recipient);
  if (cause === "Delivery opted out") return "No retry until preference changes";
  if (cause === "Recipient details") return "Correct contact, then resend manually";
  if (cause === "Provider setup") return "Restore provider, then resend manually";
  if (cause === "Provider failure") return "Review provider result before one manual retry";
  return "Review before manual resend";
};

const overdueFollowUpTemplate = [
  "{{business_name}}",
  "Dear {{customer_name}} ({{acc_number}}),",
  "Your overdue balance is {{overdue_balance}} and has been outstanding since {{oldest_due_date}} ({{days_overdue}} days).",
  "Your total account balance is {{total_outstanding}}.",
  "{{payment_information}}",
  "For enquiries contact customer care on {{business_phone}}."
].join("\n");

const collectionMessageLibrary = [
  {
    id: "bill_due",
    name: "Bill due reminder",
    description: "A concise first reminder for the current bill.",
    body: [
      "{{business_name}}",
      "Dear {{customer_name}} ({{acc_number}}),",
      "Your {{invoice_period}} water bill of {{amount}} is due on {{due_date}}.",
      "Your current account balance is {{total_outstanding}}.",
      "{{payment_information}}",
      "For assistance contact {{business_phone}}."
    ].join("\n")
  },
  {
    id: "first_overdue",
    name: "First overdue reminder",
    description: "For a newly overdue balance before escalation.",
    body: overdueFollowUpTemplate
  },
  {
    id: "seven_day_follow_up",
    name: "7-day overdue follow-up",
    description: "A firmer follow-up after the first overdue reminder.",
    body: [
      "{{business_name}}",
      "Dear {{customer_name}} ({{acc_number}}),",
      "Your overdue balance is {{overdue_balance}} and has been outstanding for {{days_overdue}} days since {{oldest_due_date}}.",
      "Please make payment or contact us to discuss your account.",
      "{{payment_information}}",
      "Customer care: {{business_phone}}."
    ].join("\n")
  },
  {
    id: "thirty_day_notice",
    name: "30+ day account action notice",
    description: "A manual, policy-reviewed notice for long-overdue accounts.",
    body: [
      "{{business_name}}",
      "Dear {{customer_name}} ({{acc_number}}),",
      "Your account has an overdue balance of {{overdue_balance}} outstanding for {{days_overdue}} days.",
      "Please pay or contact our customer care team promptly to resolve the account. Further service action may be considered in line with the applicable service terms.",
      "{{payment_information}}",
      "Customer care: {{business_phone}}."
    ].join("\n")
  }
];

function CommunicationsPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [payload, setPayload] = useState({ default_template: "", rows: [] });
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [libraryTemplateId, setLibraryTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDefault, setTemplateDefault] = useState(false);
  const [whatsAppTemplateName, setWhatsAppTemplateName] = useState("");
  const [whatsAppTemplateLanguage, setWhatsAppTemplateLanguage] = useState("en_US");
  const [whatsAppTemplateVariables, setWhatsAppTemplateVariables] = useState("");
  const [, setTemplateMessage] = useToastMessage();
  const [campaignName, setCampaignName] = useState("");
  const [communicationFilters, setCommunicationFilters] = useScopedDraft(
    user,
    "communications-filters",
    createCommunicationFilters,
    { storage: "local" }
  );
  const medium = communicationFilters.medium || "email";
  const readiness = communicationFilters.readiness || "all";
  const zoneFilter = communicationFilters.zoneFilter || "";
  const recipientOutcome = communicationFilters.recipientOutcome || "all";
  const setCommunicationFilter = (field, value) =>
    setCommunicationFilters((current) => ({ ...current, [field]: value }));
  const setMedium = (value) => setCommunicationFilter("medium", value);
  const setReadiness = (value) => setCommunicationFilter("readiness", value);
  const setZoneFilter = (value) => setCommunicationFilter("zoneFilter", value);
  const setRecipientOutcome = (value) => setCommunicationFilter("recipientOutcome", value);
  const [, setMessage] = useToastMessage();
  const [sendingId, setSendingId] = useState(null);
  const [singleReview, setSingleReview] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkReview, setBulkReview] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [, setCampaignMessage] = useToastMessage();
  const tableStorageScope = `${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`;

  const load = ({ preserveMessage = false } = {}) =>
    api.communications
      .invoicePreview()
      .then((data) => {
        setPayload(data);
        setTemplate((current) => current || data.default_template || "");
        if (!preserveMessage) setMessage("");
      })
      .catch((err) => setMessage(err.message));

  const loadInitialWorkspace = async () => {
    setInitialLoading(true);
    setInitialError("");
    try {
      const data = await api.communications.invoicePreview();
      setPayload(data);
      setTemplate((current) => current || data.default_template || "");
      setMessage("");
    } catch (err) {
      setInitialError(err.message || "Customer delivery readiness could not be loaded.");
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialWorkspace();
    loadCampaigns();
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [medium]);

  const loadTemplates = () =>
    api.communications
      .templates(medium)
      .then((rows) => {
        setTemplates(rows);
        setTemplateMessage("");
        setSelectedTemplateId((current) => {
          if (current && rows.some((row) => String(row.id) === String(current))) return current;
          if (focusKey === "overdue_follow_up") {
            setTemplateName("");
            setTemplateDefault(false);
            setWhatsAppTemplateName("");
            setWhatsAppTemplateLanguage("en_US");
            setWhatsAppTemplateVariables("");
            return "";
          }
          const defaultTemplate = rows.find((row) => row.is_default);
          if (defaultTemplate) {
            setTemplate(defaultTemplate.body);
            setTemplateName(defaultTemplate.name);
            setTemplateDefault(defaultTemplate.is_default);
            setWhatsAppTemplateName(defaultTemplate.whatsapp_template_name || "");
            setWhatsAppTemplateLanguage(defaultTemplate.whatsapp_template_language || "en_US");
            setWhatsAppTemplateVariables(formatTemplateVariables(defaultTemplate.whatsapp_template_variables));
            return String(defaultTemplate.id);
          }
          setTemplateName("");
          setTemplateDefault(false);
          setWhatsAppTemplateName("");
          setWhatsAppTemplateLanguage("en_US");
          setWhatsAppTemplateVariables("");
          return "";
        });
      })
      .catch((err) => setTemplateMessage(err.message));

  const loadCampaigns = () =>
    api.communications
      .campaigns()
      .then((rows) => {
        setCampaigns(rows);
        setCampaignMessage("");
      })
      .catch((err) => setCampaignMessage(err.message));

  const renderedRows = useMemo(() => {
    const activeTemplate = template || payload.default_template || "";
    return (payload.rows || []).map((row) => ({
      ...row,
      message: row.bill_id ? renderTemplate(activeTemplate, row.template_values) : ""
    }));
  }, [payload.default_template, payload.rows, template]);

  const rows = useMemo(() => {
    return renderedRows.filter((row) => {
      if (zoneFilter && row.zone_name !== zoneFilter) return false;
      const contact = row.contacts?.[medium];
      if (readiness === "ready") return row.bill_id && contact?.ready;
      if (readiness === "missing_contact") return !contact?.value;
      if (readiness === "disabled") return contact?.value && !contact?.enabled;
      if (readiness === "no_invoice") return !row.bill_id;
      if (readiness === "outstanding") return Number(row.total_outstanding || 0) > 0;
      if (readiness === "overdue") return Number(row.overdue_balance || 0) > 0;
      return true;
    });
  }, [medium, readiness, renderedRows, zoneFilter]);

  const zones = useMemo(
    () => [...new Set(renderedRows.map((row) => row.zone_name).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [renderedRows]
  );

  const stats = useMemo(() => {
    const source = renderedRows;
    return {
      customers: source.length,
      ready: source.filter((row) => row.bill_id && row.contacts?.[medium]?.ready).length,
      missing: source.filter((row) => !row.contacts?.[medium]?.value).length,
      outstanding: source.reduce((sum, row) => sum + Number(row.total_outstanding || 0), 0),
      overdueCustomers: source.filter((row) => Number(row.overdue_balance || 0) > 0).length,
      overdueBalance: source.reduce((sum, row) => sum + Number(row.overdue_balance || 0), 0)
    };
  }, [medium, renderedRows]);

  const table = useTableControls(rows, {
    storageKey: `communications-invoice-preview:${tableStorageScope}`,
    searchFields: [
      "message",
      "customer_name",
      "acc_number",
      "zone_name",
      "bill_number",
      "contacts.email.value",
      "contacts.sms.value",
      "contacts.whatsapp.value"
    ]
  });
  const focusKey = navigationIntent?.page === "communications" ? navigationIntent.focus : "";
  const focusedCustomerId = focusKey === "overdue_follow_up" ? Number(navigationIntent?.customer_id) : null;
  const focusedCustomer = focusedCustomerId
    ? renderedRows.find((row) => Number(row.customer_id) === focusedCustomerId)
    : null;
  const hasCommunicationFocus = ["document_delivery", "campaign_attention"].includes(focusKey);
  const focusedCampaigns = ["document_delivery", "campaign_attention"].includes(focusKey)
    ? campaigns.filter((campaign) =>
        ["running", "completed_with_errors", "failed"].includes(campaign.status) ||
        Number(campaign.failed_count || 0) > 0 ||
        Number(campaign.skipped_count || 0) > 0
      )
    : campaigns;
  const campaignTable = useTableControls(focusedCampaigns, {
    pageSize: 10,
    storageKey: `communications-campaigns:${tableStorageScope}`,
    searchFields: ["campaign_name", "medium", "status", "created_by_name", "alert_type"]
  });
  const campaignRecipients = useMemo(() => {
    const recipients = selectedCampaign?.recipients || [];
    if (recipientOutcome === "all") return recipients;
    if (recipientOutcome === "attention") return recipients.filter((recipient) => ["failed", "skipped"].includes(recipient.status));
    if (recipientOutcome === "sent") return recipients.filter((recipient) => recipient.status === "sent");
    return recipients.filter((recipient) => recipient.status === recipientOutcome);
  }, [recipientOutcome, selectedCampaign?.recipients]);
  const campaignRecipientCounts = useMemo(() => {
    const recipients = selectedCampaign?.recipients || [];
    const countFor = (status) => recipients.filter((recipient) => recipient.status === status).length;
    return {
      all: recipients.length,
      attention: recipients.filter((recipient) => ["failed", "skipped"].includes(recipient.status)).length,
      sent: countFor("sent"),
      skipped: countFor("skipped"),
      failed: countFor("failed")
    };
  }, [selectedCampaign?.recipients]);
  const recipientTable = useTableControls(campaignRecipients, {
    pageSize: 10,
    storageKey: `communications-campaign-recipients:${tableStorageScope}`,
    searchFields: ["customer_name", "acc_number", "recipient", "status", "error_message", "bill_number"]
  });

  const MediumIcon = mediumOptions.find((option) => option.value === medium)?.icon || Mail;
  const activeTemplate = template || payload.default_template || "";
  const resolvedCampaignName = campaignName.trim() || `${summarizeTemplate(activeTemplate)} - ${medium.toUpperCase()}${zoneFilter ? ` - ${zoneFilter}` : ""}`;
  const campaignAttentionCount = campaigns.filter(
    (campaign) =>
      ["running", "completed_with_errors", "failed"].includes(campaign.status) ||
      Number(campaign.failed_count || 0) > 0 ||
      Number(campaign.skipped_count || 0) > 0
  ).length;
  const activeWhatsAppTemplate =
    medium === "whatsapp" && whatsAppTemplateName.trim()
      ? {
          name: whatsAppTemplateName.trim(),
          language: whatsAppTemplateLanguage.trim() || "en_US",
          variables: parseTemplateVariables(whatsAppTemplateVariables)
        }
      : null;
  const whatsAppStatus = payload.channels?.whatsapp || {};
  const whatsAppProviderReady = Boolean(whatsAppStatus.configured);
  const readyRows = rows.filter((row) => row.bill_id && row.contacts?.[medium]?.ready);
  const visibleReadyRows = table.visibleRows.filter((row) => row.bill_id && row.contacts?.[medium]?.ready);
  const selectedRows = rows.filter((row) => selectedIds.has(row.customer_id));
  const selectedReadyRows = selectedRows.filter((row) => row.bill_id && row.contacts?.[medium]?.ready);

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(renderedRows.map((row) => row.customer_id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [renderedRows]);

  useEffect(() => {
    if (focusKey !== "overdue_follow_up") return;
    setReadiness("overdue");
    setTemplate(overdueFollowUpTemplate);
  }, [focusKey]);

  useEffect(() => {
    if (!focusedCustomer) return;
    const focusedMedium = ["email", "sms", "whatsapp"].find((option) => focusedCustomer.contacts?.[option]?.ready) || "email";
    setMedium(focusedMedium);
    table.setQuery(focusedCustomer.acc_number || focusedCustomer.customer_name || "");
    setSelectedIds((current) =>
      current.size === 1 && current.has(focusedCustomer.customer_id) ? current : new Set([focusedCustomer.customer_id])
    );
  }, [focusedCustomer?.customer_id]);

  const toggleSelected = (customerId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const selectReadyVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleReadyRows.forEach((row) => next.add(row.customer_id));
      return next;
    });
  };

  const selectAllReady = () => {
    setSelectedIds(new Set(readyRows.map((row) => row.customer_id)));
  };

  const clearSelected = () => setSelectedIds(new Set());

  const changeZoneFilter = (value) => {
    setZoneFilter(value);
    clearSelected();
  };

  const selectTemplate = (id) => {
    setSelectedTemplateId(id);
    setLibraryTemplateId("");
    const selected = templates.find((row) => String(row.id) === String(id));
    if (!selected) {
      setTemplateName("");
      setTemplateDefault(false);
      setWhatsAppTemplateName("");
      setWhatsAppTemplateLanguage("en_US");
      setWhatsAppTemplateVariables("");
      return;
    }
    setTemplate(selected.body);
    setTemplateName(selected.name);
    setTemplateDefault(Boolean(selected.is_default));
    setWhatsAppTemplateName(selected.whatsapp_template_name || "");
    setWhatsAppTemplateLanguage(selected.whatsapp_template_language || "en_US");
    setWhatsAppTemplateVariables(formatTemplateVariables(selected.whatsapp_template_variables));
  };

  const selectLibraryTemplate = (id) => {
    setLibraryTemplateId(id);
    const selected = collectionMessageLibrary.find((item) => item.id === id);
    if (!selected) return;
    setSelectedTemplateId("");
    setTemplateName(selected.name);
    setTemplateDefault(false);
    setCampaignName("");
    setWhatsAppTemplateName("");
    setWhatsAppTemplateVariables("");
    setTemplate(selected.body);
  };

  const saveTemplate = async ({ update = false } = {}) => {
    setTemplateMessage("");
    const payload = {
      name: templateName || summarizeTemplate(activeTemplate),
      medium,
      body: activeTemplate,
      whatsapp_template_name: medium === "whatsapp" ? whatsAppTemplateName : "",
      whatsapp_template_language: medium === "whatsapp" ? whatsAppTemplateLanguage : "en_US",
      whatsapp_template_variables: medium === "whatsapp" ? parseTemplateVariables(whatsAppTemplateVariables) : [],
      is_default: templateDefault
    };
    try {
      const saved =
        update && selectedTemplateId
          ? await api.communications.updateTemplate(selectedTemplateId, payload)
          : await api.communications.createTemplate(payload);
      setTemplateMessage(update ? "Template updated." : "Template saved.");
      setSelectedTemplateId(String(saved.id));
      setTemplateName(saved.name);
      setTemplateDefault(Boolean(saved.is_default));
      await loadTemplates();
    } catch (err) {
      setTemplateMessage(err.message);
    }
  };

  const requestSingleReview = (row) => {
    setMessage("");
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    const contact = row.contacts?.[medium];
    if (!row.bill_id || !contact?.ready) {
      setMessage("This customer is not ready for the selected delivery channel.");
      return;
    }
    setSingleReview({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      acc_number: row.acc_number,
      bill_number: row.bill_number,
      recipient: contact.value,
      medium,
      template: activeTemplate,
      whatsapp_template: activeWhatsAppTemplate,
      message: row.message
    });
  };

  const sendSingleAlert = async () => {
    if (!singleReview) return;
    setMessage("");
    setSendingId(singleReview.customer_id);
    try {
      const result = await api.communications.sendInvoiceAlert(singleReview.customer_id, {
        medium: singleReview.medium,
        template: singleReview.template,
        whatsapp_template: singleReview.whatsapp_template
      });
      setMessage(result.message || "Invoice alert send request completed.");
      setSingleReview(null);
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSendingId(null);
    }
  };

  const requestBulkReview = () => {
    setMessage("");
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    if (!selectedReadyRows.length) {
      setMessage("Select at least one ready customer to send.");
      return;
    }
    setBulkReview({
      medium,
      template: activeTemplate,
      whatsapp_template: activeWhatsAppTemplate,
      campaign_name: resolvedCampaignName,
      zone_name: zoneFilter || null,
      customer_ids: selectedReadyRows.map((row) => row.customer_id)
    });
  };

  const sendBulkAlerts = async () => {
    if (!bulkReview) return;
    setMessage("");
    setBulkSending(true);
    try {
      const result = await api.communications.bulkSendInvoiceAlerts({
        medium: bulkReview.medium,
        template: bulkReview.template,
        whatsapp_template: bulkReview.whatsapp_template,
        campaign_name: bulkReview.campaign_name,
        customer_ids: bulkReview.customer_ids
      });
      setMessage(result.message || "Bulk invoice alert send request completed.");
      clearSelected();
      await load({ preserveMessage: true });
      await loadCampaigns();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBulkSending(false);
      setBulkReview(null);
    }
  };

  const viewCampaign = async (id) => {
    setCampaignMessage("");
    try {
      const campaign = await api.communications.campaign(id);
      setSelectedCampaign(campaign);
      setRecipientOutcome(Number(campaign.campaign?.failed_count || 0) || Number(campaign.campaign?.skipped_count || 0) ? "attention" : "all");
    } catch (err) {
      setCampaignMessage(err.message);
    }
  };

  if (focusKey === "payment_plan_follow_up") {
    return <PaymentPlanFollowUpPanel customerId={navigationIntent?.customer_id} onClearNavigationIntent={onClearNavigationIntent} />;
  }
  if (focusKey === "standing_order_follow_up") {
    return <StandingOrderFollowUpPanel customerId={navigationIntent?.customer_id} onClearNavigationIntent={onClearNavigationIntent} />;
  }
  if (focusKey === "disconnection_warning") {
    return <DisconnectionWarningPanel customerId={navigationIntent?.customer_id} onClearNavigationIntent={onClearNavigationIntent} />;
  }
  if (focusKey === "document_delivery") {
    return <DeliveryExceptionPanel user={user} onClearNavigationIntent={onClearNavigationIntent} onNavigate={onNavigate} />;
  }

  if (initialLoading) {
    return (
      <WorkspaceState
        detail="Retrieving delivery readiness and invoice-alert recipients."
        title="Preparing customer communications"
      />
    );
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={loadInitialWorkspace}
        state="error"
        title="Customer communications could not load"
      />
    );
  }

  return (
    <section className="page-stack communications-page communications-workbench">
      <header className="page-header communications-workbench-header">
        <div>
          <p className="eyebrow">Customer alerts</p>
          <h2>Customer communications</h2>
          <p>Resolve delivery gaps, focus overdue accounts, and send only messages that are ready to reach customers.</p>
        </div>
        <div className="page-header-actions">
          <button type="button" onClick={() => onNavigate?.({ page: "communications", focus: "disconnection_warning" })}>
            Review formal warnings
          </button>
          <button type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {focusKey === "overdue_follow_up" ? (
        <FocusNotice
          title="Overdue follow-up"
          detail={focusedCustomer ? `Prepared ${focusedCustomer.customer_name} (${focusedCustomer.acc_number}) for an overdue reminder. Sending remains an explicit action in this workspace.` : "Showing accounts with overdue balances and a draft reminder. Sending remains an explicit action in this workspace."}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "campaign_attention" ? (
        <FocusNotice
          title="Campaigns needing review"
          detail="Showing campaigns that are running, failed, or have skipped/failed recipients."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {!hasCommunicationFocus && medium === "whatsapp" ? (
        <p className={whatsAppProviderReady ? "form-note" : "form-error"}>
          WhatsApp contacts use the customer phone number. Provider status: {whatsAppProviderReady ? "configured" : "not configured"} via{" "}
          {whatsAppStatus.provider || "none"}. Free-form invoice alerts may still be rejected by WhatsApp if an approved template is required.
        </p>
      ) : null}

      {!hasCommunicationFocus ? (
      <section className="communications-metrics" aria-label="Communication readiness">
        <div>
          <span>Ready to deliver</span>
          <strong>{stats.ready}</strong>
          <small>{medium.toUpperCase()} contacts with payable invoices</small>
        </div>
        <div className={stats.missing ? "needs-attention" : ""}>
          <span>Contact gaps</span>
          <strong>{stats.missing}</strong>
          <small>Customers need a usable delivery contact</small>
        </div>
        <div className={stats.overdueCustomers ? "needs-attention" : ""}>
          <span>Overdue follow-up</span>
          <strong>{stats.overdueCustomers}</strong>
          <small>{money(stats.overdueBalance)} at risk</small>
        </div>
        <div className={campaignAttentionCount ? "needs-attention" : ""}>
          <span>Campaign exceptions</span>
          <strong>{campaignAttentionCount}</strong>
          <small>{campaignAttentionCount ? "Review failed or skipped deliveries" : "No active delivery exceptions"}</small>
        </div>
      </section>
      ) : null}

      {!hasCommunicationFocus ? (
      <div className="panel communications-setup-panel">
        <div className="panel-heading">
          <h3>Invoice Alert Setup</h3>
          <MediumIcon size={18} />
        </div>
        <div className="communication-filter-grid">
          <label>
            Medium
            <select value={medium} onChange={(event) => setMedium(event.target.value)}>
              {mediumOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            View
            <select value={readiness} onChange={(event) => setReadiness(event.target.value)}>
              <option value="all">All customers</option>
              <option value="ready">Ready to send</option>
              <option value="missing_contact">Missing contact</option>
              <option value="disabled">Delivery disabled</option>
              <option value="no_invoice">No payable invoice</option>
              <option value="outstanding">Has outstanding balance</option>
              <option value="overdue">Overdue follow-up</option>
            </select>
          </label>
          <label>
            Saved template
            <select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}>
              <option value="">Custom / unsaved</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template name
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={160} />
          </label>
          <label>
            Collection message library
            <select value={libraryTemplateId} onChange={(event) => selectLibraryTemplate(event.target.value)}>
              <option value="">Choose a reviewed message</option>
              {collectionMessageLibrary.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {libraryTemplateId ? <small>{collectionMessageLibrary.find((item) => item.id === libraryTemplateId)?.description}</small> : null}
          </label>
          <label>
            Campaign name
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              placeholder={resolvedCampaignName}
              maxLength={160}
            />
          </label>
          {medium === "whatsapp" ? (
            <div className="whatsapp-readiness-panel">
              <strong>WhatsApp preparedness</strong>
              <small>Contact source: customer phone number</small>
              <small>Provider: {whatsAppStatus.provider || "none"}</small>
              <small>Provider configured: {whatsAppProviderReady ? "yes" : "no"}</small>
              <small>Supported providers prepared: {(whatsAppStatus.supported_providers || []).join(", ") || "-"}</small>
            </div>
          ) : null}
          {medium === "whatsapp" ? (
            <>
              <label>
                Approved template / Content SID
                <input
                  value={whatsAppTemplateName}
                  onChange={(event) => setWhatsAppTemplateName(event.target.value)}
                  placeholder="Meta template name or Twilio Content SID"
                  maxLength={160}
                />
              </label>
              <label>
                Language
                <input value={whatsAppTemplateLanguage} onChange={(event) => setWhatsAppTemplateLanguage(event.target.value)} maxLength={20} />
              </label>
              <label className="template-preview-field">
                Variables
                <input
                  value={whatsAppTemplateVariables}
                  onChange={(event) => setWhatsAppTemplateVariables(event.target.value)}
                  placeholder="customer_name, acc_number, total_outstanding, due_date"
                />
                <small>Comma-separated placeholders passed to the approved template body in order.</small>
              </label>
            </>
          ) : null}
          <label className="template-preview-field">
            Invoice alert template
            <textarea value={activeTemplate} onChange={(event) => { setLibraryTemplateId(""); setTemplate(event.target.value); }} />
          </label>
          <div className="template-actions">
            <label className="checkbox-row">
              <input type="checkbox" checked={templateDefault} onChange={(event) => setTemplateDefault(event.target.checked)} />
              <span>Default for {medium}</span>
            </label>
            <button type="button" onClick={() => saveTemplate({ update: false })}>
              Save as new
            </button>
            <button type="button" onClick={() => saveTemplate({ update: true })} disabled={!selectedTemplateId}>
              Update selected
            </button>
            <button type="button" onClick={() => { setLibraryTemplateId(""); setTemplate(payload.default_template || ""); }}>
              Reset template
            </button>
            <button type="button" onClick={() => selectLibraryTemplate("first_overdue")}>
              Use overdue wording
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {!hasCommunicationFocus ? (
      <div className="panel communications-delivery-panel">
        <div className="panel-heading">
          <h3>Invoice Alert Preview</h3>
          <span className="muted">{table.total} customers</span>
        </div>
        <div className="bulk-action-bar">
          <label className="communications-zone-filter">
            <span>Service zone</span>
            <select value={zoneFilter} onChange={(event) => changeZoneFilter(event.target.value)} disabled={bulkSending || Boolean(bulkReview)}>
              <option value="">All service zones</option>
              {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <div>
            <strong>{selectedReadyRows.length}</strong>
            <span> ready selected</span>
            <small>{selectedIds.size} total selected</small>
          </div>
          <button type="button" onClick={selectReadyVisible} disabled={!visibleReadyRows.length || bulkSending || Boolean(bulkReview)}>
            Select visible ready
          </button>
          <button type="button" onClick={selectAllReady} disabled={!readyRows.length || bulkSending || Boolean(bulkReview)}>
            {zoneFilter ? "Select zone ready" : "Select all ready"}
          </button>
          <button type="button" onClick={clearSelected} disabled={!selectedIds.size || bulkSending || Boolean(bulkReview)}>
            Clear
          </button>
          <button
            type="button"
            onClick={requestBulkReview}
            disabled={!selectedReadyRows.length || bulkSending || Boolean(bulkReview) || (medium === "whatsapp" && !whatsAppProviderReady)}
          >
            <Send size={14} />
            {bulkSending ? "Sending selected" : "Review selected"}
          </button>
        </div>
        <TableControls table={table} label="customers" placeholder="Search messages, contacts, or accounts" />
        <div className="table-wrap communications-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Message</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Medium</th>
                <th>Invoice</th>
                <th>Balance</th>
                <th>Issues</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.visibleRows.length ? (
                table.visibleRows.map((row) => (
                  <tr key={row.customer_id}>
                    <td>
                      <label className="checkbox-row compact-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.customer_id)}
                          onChange={() => toggleSelected(row.customer_id)}
                          disabled={!row.bill_id || !row.contacts?.[medium]?.ready || bulkSending || Boolean(bulkReview)}
                        />
                        <span>Select</span>
                      </label>
                    </td>
                    <td className="communication-message-cell">
                      {row.message ? <div className="message-preview">{row.message}</div> : <span className="muted">No message</span>}
                    </td>
                    <td>
                      <strong>{row.customer_name}</strong>
                      <small>{row.acc_number}</small>
                      <small>{row.zone_name || "-"}</small>
                    </td>
                    <td>
                      <span>{row.contacts?.email?.value || "-"}</span>
                      <small>{row.contacts?.email?.enabled ? "Enabled" : "Disabled"}</small>
                    </td>
                    <td>
                      <span>{row.contacts?.sms?.value || "-"}</span>
                      <small>SMS {row.contacts?.sms?.enabled ? "enabled" : "disabled"}</small>
                      <small>WhatsApp {row.contacts?.whatsapp?.enabled ? "enabled" : "disabled"}</small>
                    </td>
                    <td>
                      <StatusBadge status={contactLabel(row, medium).toLowerCase().replace(/\s+/g, "_")} />
                      <small>{contactLabel(row, medium)}</small>
                    </td>
                    <td>
                      <strong>{row.billing_period_name || date(row.billing_month)}</strong>
                      <small>{row.bill_number || "-"}</small>
                      <small>{row.bill_status || "-"}</small>
                    </td>
                    <td>
                      <strong>{money(row.total_outstanding)}</strong>
                      <small>Latest bill {money(row.arrears_after_payment)}</small>
                    </td>
                    <td>
                      {row.issues?.length ? (
                        row.issues.map((issue) => <small key={issue}>{issue}</small>)
                      ) : (
                        <StatusBadge status="ready" />
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => requestSingleReview(row)}
                        disabled={
                          !row.bill_id ||
                          !row.contacts?.[medium]?.ready ||
                          sendingId === row.customer_id ||
                          Boolean(singleReview) ||
                          Boolean(bulkReview) ||
                          (medium === "whatsapp" && !whatsAppProviderReady)
                        }
                        title={medium === "whatsapp" && !whatsAppProviderReady ? "WhatsApp provider is not configured" : `Review ${medium} alert`}
                      >
                        <Send size={14} />
                        {sendingId === row.customer_id ? "Sending" : "Review"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={10} title="No communication previews found" detail="Change filters and try again." />
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      <CampaignRecoveryWorkspace
        campaignDeliveryCause={campaignDeliveryCause}
        campaignRetryPolicy={campaignRetryPolicy}
        campaignRecipientCounts={campaignRecipientCounts}
        campaignRecipientTarget={campaignRecipientTarget}
        campaignTable={campaignTable}
        dateTime={dateTime}
        onCloseCampaign={() => setSelectedCampaign(null)}
        onNavigate={onNavigate}
        onRecipientOutcomeChange={setRecipientOutcome}
        onRefresh={loadCampaigns}
        onViewCampaign={viewCampaign}
        recipientOutcome={recipientOutcome}
        recipientTable={recipientTable}
        selectedCampaign={selectedCampaign}
      />
      <ReviewDialog
        open={Boolean(singleReview)}
        eyebrow="Review invoice alert"
        title={`Send invoice alert to ${singleReview?.customer_name || "customer"}`}
        description="This starts one delivery attempt. Review the recipient and rendered message before sending."
        confirmLabel="Send alert"
        busy={Boolean(singleReview && sendingId === singleReview.customer_id)}
        busyLabel="Sending alert..."
        reasonLabel={null}
        onCancel={() => setSingleReview(null)}
        onConfirm={sendSingleAlert}
      >
        <div className="review-summary-grid">
          <div><span>Account</span><strong>{singleReview?.acc_number || "-"}</strong></div>
          <div><span>Bill</span><strong>{singleReview?.bill_number || "-"}</strong></div>
          <div><span>Channel</span><strong>{String(singleReview?.medium || "-").toUpperCase()}</strong></div>
          <div><span>Recipient</span><strong>{singleReview?.recipient || "-"}</strong></div>
        </div>
        <div className="review-message-preview"><span>Prepared message</span><pre>{singleReview?.message || "No message rendered."}</pre></div>
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(bulkReview)}
        eyebrow="Review campaign"
        title={`Send ${Number(bulkReview?.customer_ids?.length || 0).toLocaleString()} invoice alert${bulkReview?.customer_ids?.length === 1 ? "" : "s"}`}
        description="This creates a campaign and starts the selected delivery attempts. Review the batch details before sending."
        confirmLabel="Send campaign"
        busy={bulkSending}
        busyLabel="Sending campaign..."
        reasonLabel={null}
        onCancel={() => !bulkSending && setBulkReview(null)}
        onConfirm={sendBulkAlerts}
      >
        <div className="review-summary-grid">
          <div><span>Recipients</span><strong>{Number(bulkReview?.customer_ids?.length || 0).toLocaleString()}</strong></div>
          <div><span>Scope</span><strong>{bulkReview?.zone_name || "Selected accounts"}</strong></div>
          <div><span>Channel</span><strong>{String(bulkReview?.medium || "-").toUpperCase()}</strong></div>
          <div><span>Campaign</span><strong>{bulkReview?.campaign_name || "-"}</strong></div>
          <div><span>Message</span><strong>{bulkReview?.template ? "Prepared" : "Missing"}</strong></div>
        </div>
      </ReviewDialog>
    </section>
  );
}

export default CommunicationsPage;
