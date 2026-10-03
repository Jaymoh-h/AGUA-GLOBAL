import { Mail, MessageSquare, Send, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "./EmptyState";
import FocusNotice from "./FocusNotice";
import ReviewDialog from "./ReviewDialog";
import StatusBadge from "./StatusBadge";
import TableControls, { useTableControls } from "./TableControls";
import { useToastMessage } from "./ToastProvider";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? String(value).slice(0, 10) : "-");

const mediumOptions = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: Smartphone }
];

const renderTemplate = (template, values = {}) =>
  String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    values[key] === undefined || values[key] === null ? "" : String(values[key])
  );

const contactLabel = (row, medium) => {
  const contact = row.contacts?.[medium];
  if (!contact?.value) return "Missing";
  if (!contact.enabled) return "Disabled";
  return contact.ready ? "Ready" : "Not ready";
};

function StandingOrderFollowUpPanel({ customerId, onClearNavigationIntent }) {
  const [payload, setPayload] = useState({ default_template: "", rows: [], channels: {} });
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [medium, setMedium] = useState("email");
  const [sendingId, setSendingId] = useState(null);
  const [reminderReview, setReminderReview] = useState(null);
  const [, setMessage] = useToastMessage();
  const [, setTemplateMessage] = useToastMessage();

  const load = async ({ preserveMessage = false } = {}) => {
    try {
      const nextPayload = await api.communications.standingOrderFollowUp();
      setPayload(nextPayload);
      setTemplate((current) => current || nextPayload.default_template || "");
      if (!preserveMessage) setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadTemplates = async () => {
    try {
      const rows = await api.communications.templates(medium, "standing_order_alert");
      setTemplates(rows);
      setSelectedTemplateId((current) => {
        if (current && rows.some((row) => String(row.id) === String(current))) return current;
        const defaultTemplate = rows.find((row) => row.is_default);
        if (defaultTemplate) {
          setTemplate(defaultTemplate.body);
          setTemplateName(defaultTemplate.name);
          return String(defaultTemplate.id);
        }
        return "";
      });
    } catch (error) {
      setTemplateMessage(error.message);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadTemplates(); }, [medium]);

  const rows = useMemo(
    () => (payload.rows || []).map((row) => ({ ...row, message: renderTemplate(template || payload.default_template, row.template_values) })),
    [payload.default_template, payload.rows, template]
  );
  const table = useTableControls(rows, { searchFields: ["customer_name", "acc_number", "mandate_reference", "message", "contacts.email.value", "contacts.sms.value"] });

  useEffect(() => {
    if (!customerId) return;
    const focusedOrder = rows.find((row) => Number(row.customer_id) === Number(customerId));
    if (focusedOrder) table.setQuery(focusedOrder.acc_number || focusedOrder.customer_name || "");
  }, [customerId, rows]);

  const activeTemplate = template || payload.default_template || "";
  const MediumIcon = mediumOptions.find((option) => option.value === medium)?.icon || Mail;
  const whatsAppStatus = payload.channels?.whatsapp || {};
  const whatsAppProviderReady = Boolean(whatsAppStatus.configured);
  const readyCount = rows.filter((row) => row.contacts?.[medium]?.ready).length;
  const totalShortfall = rows.reduce((sum, row) => sum + Number(row.shortfall_amount || 0), 0);

  const selectTemplate = (id) => {
    setSelectedTemplateId(id);
    const selected = templates.find((row) => String(row.id) === String(id));
    if (!selected) {
      setTemplateName("");
      return;
    }
    setTemplate(selected.body);
    setTemplateName(selected.name);
  };

  const saveTemplate = async () => {
    try {
      const saved = await api.communications.createTemplate({
        name: templateName.trim() || "Standing-order reminder",
        alert_type: "standing_order_alert",
        medium,
        body: activeTemplate,
        is_default: false
      });
      setSelectedTemplateId(String(saved.id));
      setTemplateName(saved.name);
      setTemplateMessage("Standing-order template saved.");
      await loadTemplates();
    } catch (error) {
      setTemplateMessage(error.message);
    }
  };

  const requestReminderReview = (row) => {
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    const contact = row.contacts?.[medium];
    if (!contact?.ready) {
      setMessage("This account is not ready for the selected delivery channel.");
      return;
    }
    setReminderReview({
      standing_order_id: row.standing_order_id,
      mandate_reference: row.mandate_reference,
      customer_name: row.customer_name,
      acc_number: row.acc_number,
      recipient: contact.value,
      shortfall_amount: row.shortfall_amount,
      medium,
      template: activeTemplate,
      message: row.message
    });
  };

  const sendReminder = async () => {
    if (!reminderReview) return;
    setSendingId(reminderReview.standing_order_id);
    try {
      const result = await api.communications.sendStandingOrderAlert(reminderReview.standing_order_id, {
        medium: reminderReview.medium,
        template: reminderReview.template
      });
      setMessage(result.message || "Standing-order reminder send request completed.");
      setReminderReview(null);
      await load({ preserveMessage: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <section className="page-stack communications-page communications-workbench">
      <header className="page-header communications-workbench-header">
        <div><p className="eyebrow">Revenue follow-up</p><h2>Standing-order reminders</h2><p>Review every unmatched scheduled amount before sending a customer reminder.</p></div>
        <button type="button" onClick={load}>Refresh</button>
      </header>

      <FocusNotice title="Standing orders behind" detail={customerId ? "The selected account is filtered where an active mandate is behind. Sending remains an explicit, one-account action." : "Only active mandates with confirmed receipts below their scheduled amount appear here. Sending remains an explicit, one-account action."} onClear={onClearNavigationIntent} />

      <section className="communications-metrics" aria-label="Standing-order reminder readiness">
        <div><span>Mandates behind</span><strong>{rows.length}</strong><small>Active schedules requiring review</small></div>
        <div className={totalShortfall ? "needs-attention" : ""}><span>Unmatched schedule</span><strong>{money(totalShortfall)}</strong><small>Against confirmed, reference-matched receipts</small></div>
        <div><span>Ready to deliver</span><strong>{readyCount}</strong><small>{medium.toUpperCase()} contacts ready</small></div>
      </section>

      <div className="panel communications-setup-panel">
        <div className="panel-heading"><h3>Reminder setup</h3><MediumIcon size={18} /></div>
        <div className="communication-filter-grid">
          <label>Medium<select value={medium} onChange={(event) => setMedium(event.target.value)}>{mediumOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Saved template<select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}><option value="">Custom / unsaved</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_default ? " (default)" : ""}</option>)}</select></label>
          <label>Template name<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={160} /></label>
          <label className="template-preview-field">Standing-order reminder template<textarea value={activeTemplate} onChange={(event) => setTemplate(event.target.value)} /></label>
          <div className="template-actions"><button type="button" onClick={saveTemplate}>Save as new</button><button type="button" onClick={() => setTemplate(payload.default_template || "")}>Reset template</button></div>
        </div>
      </div>

      {medium === "whatsapp" ? <p className={whatsAppProviderReady ? "form-note" : "form-error"}>WhatsApp provider: {whatsAppProviderReady ? "configured" : "not configured"} via {whatsAppStatus.provider || "none"}.</p> : null}

      <div className="panel communications-delivery-panel">
        <div className="panel-heading"><h3>Reminder preview</h3><span className="muted">{table.total} mandates</span></div>
        <TableControls table={table} label="standing orders" placeholder="Search accounts, mandates, or messages" />
        <div className="table-wrap communications-table-wrap payment-plan-reminder-table">
          <table>
            <thead><tr><th>Message</th><th>Mandate</th><th>Account</th><th>Expected</th><th>Confirmed</th><th>Shortfall</th><th>Medium</th><th>Action</th></tr></thead>
            <tbody>{table.visibleRows.length ? table.visibleRows.map((row) => (
              <tr key={row.standing_order_id}>
                <td className="communication-message-cell"><div className="message-preview">{row.message}</div></td>
                <td><strong>{row.mandate_reference}</strong><small>{money(row.expected_amount)} {row.frequency}</small><small>Next due {date(row.next_due_date)}</small></td>
                <td><strong>{row.customer_name}</strong><small>{row.acc_number}</small></td>
                <td>{money(row.expected_to_date)}</td><td>{money(row.matched_amount)}</td><td><strong>{money(row.shortfall_amount)}</strong></td>
                <td><StatusBadge status={contactLabel(row, medium).toLowerCase().replace(/\s+/g, "_")} /><small>{contactLabel(row, medium)}</small></td>
                <td><button type="button" onClick={() => requestReminderReview(row)} disabled={!row.contacts?.[medium]?.ready || sendingId === row.standing_order_id || Boolean(reminderReview) || (medium === "whatsapp" && !whatsAppProviderReady)} title={medium === "whatsapp" && !whatsAppProviderReady ? "WhatsApp provider is not configured" : "Review standing-order reminder"}><Send size={14} />{sendingId === row.standing_order_id ? "Sending" : "Review"}</button></td>
              </tr>
            )) : <EmptyTableRow colSpan={8} title="No standing-order reminders are due" detail="All active mandates are upcoming or matched to their scheduled receipts." />}</tbody>
          </table>
        </div>
      </div>
      <ReviewDialog
        open={Boolean(reminderReview)}
        eyebrow="Review standing-order reminder"
        title={`Send reminder to ${reminderReview?.customer_name || "customer"}`}
        description="This starts one delivery attempt. Review the mandate, recipient, and rendered message before sending."
        confirmLabel="Send reminder"
        busy={Boolean(reminderReview && sendingId === reminderReview.standing_order_id)}
        busyLabel="Sending reminder..."
        reasonLabel={null}
        onCancel={() => setReminderReview(null)}
        onConfirm={sendReminder}
      >
        <div className="review-summary-grid">
          <div><span>Account</span><strong>{reminderReview?.acc_number || "-"}</strong></div>
          <div><span>Mandate</span><strong>{reminderReview?.mandate_reference || "-"}</strong></div>
          <div><span>Shortfall</span><strong>{money(reminderReview?.shortfall_amount)}</strong></div>
          <div><span>Recipient</span><strong>{reminderReview?.recipient || "-"}</strong></div>
          <div><span>Channel</span><strong>{String(reminderReview?.medium || "-").toUpperCase()}</strong></div>
        </div>
        <div className="review-message-preview"><span>Prepared message</span><pre>{reminderReview?.message || "No message rendered."}</pre></div>
      </ReviewDialog>
    </section>
  );
}

export default StandingOrderFollowUpPanel;
