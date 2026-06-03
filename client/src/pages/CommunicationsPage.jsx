import { Eye, Mail, MessageSquare, Send, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? String(value).slice(0, 10) : "-");
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

const mediumOptions = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: Smartphone }
];

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

function CommunicationsPage({ navigationIntent, onClearNavigationIntent }) {
  const [payload, setPayload] = useState({ default_template: "", rows: [] });
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDefault, setTemplateDefault] = useState(false);
  const [whatsAppTemplateName, setWhatsAppTemplateName] = useState("");
  const [whatsAppTemplateLanguage, setWhatsAppTemplateLanguage] = useState("en_US");
  const [whatsAppTemplateVariables, setWhatsAppTemplateVariables] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [medium, setMedium] = useState("email");
  const [readiness, setReadiness] = useState("all");
  const [message, setMessage] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignMessage, setCampaignMessage] = useState("");

  const load = ({ preserveMessage = false } = {}) =>
    api.communications
      .invoicePreview()
      .then((data) => {
        setPayload(data);
        setTemplate((current) => current || data.default_template || "");
        if (!preserveMessage) setMessage("");
      })
      .catch((err) => setMessage(err.message));

  useEffect(() => {
    load();
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
      const contact = row.contacts?.[medium];
      if (readiness === "ready") return row.bill_id && contact?.ready;
      if (readiness === "missing_contact") return !contact?.value;
      if (readiness === "disabled") return contact?.value && !contact?.enabled;
      if (readiness === "no_invoice") return !row.bill_id;
      if (readiness === "outstanding") return Number(row.total_outstanding || 0) > 0;
      return true;
    });
  }, [medium, readiness, renderedRows]);

  const stats = useMemo(() => {
    const source = renderedRows;
    return {
      customers: source.length,
      ready: source.filter((row) => row.bill_id && row.contacts?.[medium]?.ready).length,
      missing: source.filter((row) => !row.contacts?.[medium]?.value).length,
      outstanding: source.reduce((sum, row) => sum + Number(row.total_outstanding || 0), 0)
    };
  }, [medium, renderedRows]);

  const table = useTableControls(rows, {
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
    searchFields: ["campaign_name", "medium", "status", "created_by_name", "alert_type"]
  });
  const recipientTable = useTableControls(selectedCampaign?.recipients || [], {
    pageSize: 10,
    searchFields: ["customer_name", "acc_number", "recipient", "status", "error_message", "bill_number"]
  });

  const MediumIcon = mediumOptions.find((option) => option.value === medium)?.icon || Mail;
  const activeTemplate = template || payload.default_template || "";
  const resolvedCampaignName = campaignName.trim() || `${summarizeTemplate(activeTemplate)} - ${medium.toUpperCase()}`;
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

  const selectTemplate = (id) => {
    setSelectedTemplateId(id);
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

  const sendAlert = async (row) => {
    setMessage("");
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    setSendingId(row.customer_id);
    try {
      const result = await api.communications.sendInvoiceAlert(row.customer_id, {
        medium,
        template: activeTemplate,
        whatsapp_template: activeWhatsAppTemplate
      });
      setMessage(result.message || "Invoice alert send request completed.");
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSendingId(null);
    }
  };

  const sendBulkAlerts = async () => {
    setMessage("");
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    if (!selectedReadyRows.length) {
      setMessage("Select at least one ready customer to send.");
      return;
    }
    setBulkSending(true);
    try {
      const result = await api.communications.bulkSendInvoiceAlerts({
        medium,
        template: activeTemplate,
        whatsapp_template: activeWhatsAppTemplate,
        campaign_name: resolvedCampaignName,
        customer_ids: selectedReadyRows.map((row) => row.customer_id)
      });
      setMessage(result.message || "Bulk invoice alert send request completed.");
      clearSelected();
      await load({ preserveMessage: true });
      await loadCampaigns();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBulkSending(false);
    }
  };

  const viewCampaign = async (id) => {
    setCampaignMessage("");
    try {
      setSelectedCampaign(await api.communications.campaign(id));
    } catch (err) {
      setCampaignMessage(err.message);
    }
  };

  return (
    <section className="page-stack communications-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer alerts</p>
          <h2>Communications</h2>
        </div>
        <button type="button" onClick={load}>
          Refresh
        </button>
      </header>

      {message ? <p className="form-error">{message}</p> : null}
      {["document_delivery", "campaign_attention"].includes(focusKey) ? (
        <FocusNotice
          title={focusKey === "document_delivery" ? "Delivery exceptions" : "Campaigns needing review"}
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
      <div className="stat-grid">
        <StatCard label="Customers" value={stats.customers} />
        <StatCard label={`${medium.toUpperCase()} ready`} value={stats.ready} />
        <StatCard label="Missing contact" value={stats.missing} />
        <StatCard label="Outstanding" value={money(stats.outstanding)} />
      </div>
      ) : null}

      {!hasCommunicationFocus ? (
      <div className="panel">
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
            <textarea value={activeTemplate} onChange={(event) => setTemplate(event.target.value)} />
          </label>
          {templateMessage ? <p className="form-note template-status-message">{templateMessage}</p> : null}
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
            <button type="button" onClick={() => setTemplate(payload.default_template || "")}>
              Reset template
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {!hasCommunicationFocus ? (
      <div className="panel">
        <div className="panel-heading">
          <h3>Invoice Alert Preview</h3>
          <span className="muted">{table.total} customers</span>
        </div>
        <div className="bulk-action-bar">
          <div>
            <strong>{selectedReadyRows.length}</strong>
            <span> ready selected</span>
            <small>{selectedIds.size} total selected</small>
          </div>
          <button type="button" onClick={selectReadyVisible} disabled={!visibleReadyRows.length || bulkSending}>
            Select visible ready
          </button>
          <button type="button" onClick={selectAllReady} disabled={!readyRows.length || bulkSending}>
            Select all ready
          </button>
          <button type="button" onClick={clearSelected} disabled={!selectedIds.size || bulkSending}>
            Clear
          </button>
          <button
            type="button"
            onClick={sendBulkAlerts}
            disabled={!selectedReadyRows.length || bulkSending || (medium === "whatsapp" && !whatsAppProviderReady)}
          >
            <Send size={14} />
            {bulkSending ? "Sending selected" : "Send selected"}
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
                          disabled={!row.bill_id || !row.contacts?.[medium]?.ready || bulkSending}
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
                        onClick={() => sendAlert(row)}
                        disabled={
                          !row.bill_id ||
                          !row.contacts?.[medium]?.ready ||
                          sendingId === row.customer_id ||
                          (medium === "whatsapp" && !whatsAppProviderReady)
                        }
                        title={medium === "whatsapp" && !whatsAppProviderReady ? "WhatsApp provider is not configured" : `Send ${medium} alert`}
                      >
                        <Send size={14} />
                        {sendingId === row.customer_id ? "Sending" : "Send"}
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

      <div className="panel">
        <div className="panel-heading">
          <h3>Campaign History</h3>
          <button type="button" onClick={loadCampaigns}>
            Refresh
          </button>
        </div>
        {campaignMessage ? <p className="form-error">{campaignMessage}</p> : null}
        <TableControls table={campaignTable} label="campaigns" placeholder="Search campaigns" />
        <div className="table-wrap campaign-history-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Medium</th>
                <th>Status</th>
                <th>Total</th>
                <th>Sent</th>
                <th>Skipped</th>
                <th>Failed</th>
                <th>By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {campaignTable.visibleRows.length ? (
                campaignTable.visibleRows.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <strong>{campaign.campaign_name || "-"}</strong>
                      <small>{campaign.alert_type?.replace(/_/g, " ") || "-"}</small>
                    </td>
                    <td>{dateTime(campaign.created_at)}</td>
                    <td>{campaign.medium}</td>
                    <td>
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td>{campaign.total_count}</td>
                    <td>{campaign.sent_count}</td>
                    <td>{campaign.skipped_count}</td>
                    <td>{campaign.failed_count}</td>
                    <td>{campaign.created_by_name || "-"}</td>
                    <td>
                      <button type="button" onClick={() => viewCampaign(campaign.id)}>
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={10} title="No campaign history found" detail="Bulk sends will appear here." />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCampaign ? (
        <div className="panel">
          <div className="panel-heading">
            <h3>Campaign Results</h3>
            <button type="button" onClick={() => setSelectedCampaign(null)}>
              Close
            </button>
          </div>
          <div className="campaign-summary-grid">
            <StatCard label="Medium" value={selectedCampaign.campaign.medium} />
            <StatCard label="Status" value={selectedCampaign.campaign.status} />
            <StatCard label="Sent" value={selectedCampaign.campaign.sent_count} />
            <StatCard label="Failed" value={selectedCampaign.campaign.failed_count} />
          </div>
          <TableControls table={recipientTable} label="recipients" placeholder="Search recipients" />
          <div className="table-wrap campaign-results-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Recipient</th>
                  <th>Bill</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Error</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {recipientTable.visibleRows.length ? (
                  recipientTable.visibleRows.map((recipient) => (
                    <tr key={recipient.id}>
                      <td>
                        <strong>{recipient.customer_name || "-"}</strong>
                        <small>{recipient.acc_number || "-"}</small>
                      </td>
                      <td>{recipient.recipient || "-"}</td>
                      <td>{recipient.bill_number || recipient.bill_id || "-"}</td>
                      <td>
                        <StatusBadge status={recipient.status} />
                      </td>
                      <td>{recipient.provider_message_id || "-"}</td>
                      <td>{recipient.error_message || "-"}</td>
                      <td>{dateTime(recipient.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={7} title="No recipients found" detail="This campaign has no recorded recipients." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default CommunicationsPage;
