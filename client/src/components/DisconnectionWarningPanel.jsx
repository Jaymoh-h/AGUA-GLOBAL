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
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

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

function DisconnectionWarningPanel({ customerId, onClearNavigationIntent }) {
  const [payload, setPayload] = useState({ default_template: "", rows: [], summary: {}, channels: {} });
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [medium, setMedium] = useState("email");
  const [sendingId, setSendingId] = useState(null);
  const [warningReview, setWarningReview] = useState(null);
  const [, setMessage] = useToastMessage();
  const [, setTemplateMessage] = useToastMessage();

  const load = async ({ preserveMessage = false } = {}) => {
    try {
      const nextPayload = await api.communications.disconnectionWarningFollowUp();
      setPayload(nextPayload);
      setTemplate((current) => current || nextPayload.default_template || "");
      if (!preserveMessage) setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadTemplates = async () => {
    try {
      const rows = await api.communications.templates(medium, "disconnection_warning");
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
  const table = useTableControls(rows, {
    searchFields: ["customer_name", "acc_number", "zone_name", "message", "contacts.email.value", "contacts.sms.value"]
  });

  useEffect(() => {
    if (!customerId) return;
    const focusedAccount = rows.find((row) => Number(row.customer_id) === Number(customerId));
    if (focusedAccount) table.setQuery(focusedAccount.acc_number || focusedAccount.customer_name || "");
  }, [customerId, rows]);

  const activeTemplate = template || payload.default_template || "";
  const MediumIcon = mediumOptions.find((option) => option.value === medium)?.icon || Mail;
  const whatsAppStatus = payload.channels?.whatsapp || {};
  const whatsAppProviderReady = Boolean(whatsAppStatus.configured);
  const readyCount = rows.filter((row) => row.can_send && row.contacts?.[medium]?.ready).length;
  const summary = payload.summary || {};

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
        name: templateName.trim() || "Formal payment warning",
        alert_type: "disconnection_warning",
        medium,
        body: activeTemplate,
        is_default: false
      });
      setSelectedTemplateId(String(saved.id));
      setTemplateName(saved.name);
      setTemplateMessage("Formal warning template saved.");
      await loadTemplates();
    } catch (error) {
      setTemplateMessage(error.message);
    }
  };

  const openWarningReview = (row) => {
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    setWarningReview(row);
  };

  const sendWarning = async (approvalNote) => {
    const row = warningReview;
    if (!row) return;
    if (medium === "whatsapp" && !whatsAppProviderReady) {
      setMessage("WhatsApp provider is not configured yet.");
      return;
    }
    setSendingId(row.customer_id);
    try {
      const result = await api.communications.sendDisconnectionWarning(row.customer_id, {
        medium,
        template: activeTemplate,
        approval_note: approvalNote
      });
      setMessage(result.message || "Disconnection warning send request completed.");
      await load({ preserveMessage: true });
      setWarningReview(null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <section className="page-stack communications-page communications-workbench">
      <header className="page-header communications-workbench-header">
        <div>
          <p className="eyebrow">Revenue protection</p>
          <h2>Disconnection warnings</h2>
          <p>Review each formal warning before sending. This workspace records communication only and never changes a customer&apos;s service status.</p>
        </div>
        <button type="button" onClick={load}>Refresh</button>
      </header>

      <FocusNotice
        title="Policy-reviewed escalation"
        detail={customerId ? "The selected account is shown only when it is more than 90 days overdue and has no active payment plan. Sending is a one-account action; no service change is made." : "Only accounts more than 90 days overdue and without an active payment plan can be warned. Sending is a one-account action; no service change is made."}
        onClear={onClearNavigationIntent}
      />

      <section className="communications-metrics" aria-label="Disconnection warning readiness">
        <div><span>Eligible accounts</span><strong>{Number(summary.eligible_count || 0).toLocaleString()}</strong><small>More than 90 days overdue</small></div>
        <div className={Number(summary.eligible_balance || 0) ? "needs-attention" : ""}><span>Eligible balance</span><strong>{money(summary.eligible_balance)}</strong><small>Requires a human decision</small></div>
        <div><span>Plan-protected</span><strong>{Number(summary.protected_payment_plan_count || 0).toLocaleString()}</strong><small>Excluded while a payment plan is active</small></div>
        <div><span>Cooling down</span><strong>{Number(summary.cooldown_count || 0).toLocaleString()}</strong><small>Successful warning in the last 7 days</small></div>
        <div><span>Ready to send</span><strong>{readyCount}</strong><small>{medium.toUpperCase()} contacts ready</small></div>
      </section>

      <div className="panel communications-setup-panel">
        <div className="panel-heading"><h3>Warning setup</h3><MediumIcon size={18} /></div>
        <div className="communication-filter-grid">
          <label>Medium<select value={medium} onChange={(event) => setMedium(event.target.value)}>{mediumOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Saved template<select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}><option value="">Custom / unsaved</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_default ? " (default)" : ""}</option>)}</select></label>
          <label>Template name<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={160} /></label>
          <label className="template-preview-field">Formal warning template<textarea value={activeTemplate} onChange={(event) => setTemplate(event.target.value)} /></label>
          <div className="template-actions"><button type="button" onClick={saveTemplate}>Save as new</button><button type="button" onClick={() => setTemplate(payload.default_template || "")}>Reset template</button></div>
        </div>
      </div>

      {medium === "whatsapp" ? <p className={whatsAppProviderReady ? "form-note" : "form-error"}>WhatsApp provider: {whatsAppProviderReady ? "configured" : "not configured"} via {whatsAppStatus.provider || "none"}.</p> : null}

      <div className="panel communications-delivery-panel">
        <div className="panel-heading"><h3>Warning preview</h3><span className="muted">{table.total} accounts</span></div>
        <TableControls table={table} label="eligible accounts" placeholder="Search accounts, customers, or warnings" />
        <div className="table-wrap communications-table-wrap payment-plan-reminder-table">
          <table>
            <thead><tr><th>Message</th><th>Account</th><th>Oldest due</th><th>Days overdue</th><th>Overdue balance</th><th>Delivery</th><th>Action</th></tr></thead>
            <tbody>{table.visibleRows.length ? table.visibleRows.map((row) => (
              <tr key={row.customer_id}>
                <td className="communication-message-cell"><div className="message-preview">{row.message}</div></td>
                <td><strong>{row.customer_name}</strong><small>{row.acc_number}</small><small>{row.zone_name || "Unzoned"}</small></td>
                <td>{date(row.oldest_due_date)}</td><td><strong>{Number(row.days_overdue || 0).toLocaleString()}</strong></td><td><strong>{money(row.overdue_balance)}</strong></td>
                <td>{row.can_send ? <><StatusBadge status={contactLabel(row, medium).toLowerCase().replace(/\s+/g, "_")} /><small>{contactLabel(row, medium)}</small></> : <><StatusBadge status="cooldown" /><small>Sent {dateTime(row.last_warning_sent_at)} by {String(row.last_warning_channel || "-").toUpperCase()}</small><small>Review after {date(row.cooldown_until)}</small></>}</td>
                <td><button type="button" onClick={() => openWarningReview(row)} disabled={!row.can_send || !row.contacts?.[medium]?.ready || sendingId === row.customer_id || (medium === "whatsapp" && !whatsAppProviderReady)} title={!row.can_send ? `Warning cooldown until ${date(row.cooldown_until)}` : "Review formal warning"}><Send size={14} />{sendingId === row.customer_id ? "Sending" : row.can_send ? "Review" : "Cooling down"}</button></td>
              </tr>
            )) : <EmptyTableRow colSpan={7} title="No formal warnings are ready" detail="No account is more than 90 days overdue without an active payment plan." />}</tbody>
          </table>
        </div>
      </div>
      <ReviewDialog
        open={Boolean(warningReview)}
        eyebrow="Formal warning review"
        title={warningReview ? `Send formal warning to ${warningReview.customer_name}?` : "Send formal warning"}
        description={warningReview ? `${warningReview.acc_number} has ${Number(warningReview.days_overdue || 0).toLocaleString()} days overdue and ${money(warningReview.overdue_balance)} outstanding. This sends a communication only; it does not change service status.` : ""}
        confirmLabel="Send formal warning"
        reasonLabel="Approval reference or note"
        reasonPlaceholder="Record the policy approval, review reference, or escalation note"
        busy={Boolean(warningReview && sendingId === warningReview.customer_id)}
        busyLabel="Sending warning..."
        danger
        onCancel={() => !sendingId && setWarningReview(null)}
        onConfirm={sendWarning}
      >
        <div className="review-summary-grid">
          <div><span>Oldest due</span><strong>{date(warningReview?.oldest_due_date)}</strong></div>
          <div><span>Delivery channel</span><strong>{medium.toUpperCase()}</strong></div>
        </div>
      </ReviewDialog>
    </section>
  );
}

export default DisconnectionWarningPanel;
