import { Mail, MessageSquare, Send, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => (value ? String(value).slice(0, 10) : "-");

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

function CommunicationsPage() {
  const [payload, setPayload] = useState({ default_template: "", rows: [] });
  const [template, setTemplate] = useState("");
  const [medium, setMedium] = useState("email");
  const [readiness, setReadiness] = useState("all");
  const [message, setMessage] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

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
  }, []);

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

  const MediumIcon = mediumOptions.find((option) => option.value === medium)?.icon || Mail;
  const activeTemplate = template || payload.default_template || "";
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

  const sendAlert = async (row) => {
    setMessage("");
    if (medium === "whatsapp") {
      setMessage("WhatsApp sending will be added in the provider slice. Use SMS or email for now.");
      return;
    }
    setSendingId(row.customer_id);
    try {
      const result = await api.communications.sendInvoiceAlert(row.customer_id, {
        medium,
        template: activeTemplate
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
    if (medium === "whatsapp") {
      setMessage("WhatsApp sending will be added in the provider slice. Use SMS or email for now.");
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
        customer_ids: selectedReadyRows.map((row) => row.customer_id)
      });
      setMessage(result.message || "Bulk invoice alert send request completed.");
      clearSelected();
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBulkSending(false);
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

      <div className="stat-grid">
        <StatCard label="Customers" value={stats.customers} />
        <StatCard label={`${medium.toUpperCase()} ready`} value={stats.ready} />
        <StatCard label="Missing contact" value={stats.missing} />
        <StatCard label="Outstanding" value={money(stats.outstanding)} />
      </div>

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
          <label className="template-preview-field">
            Invoice alert template
            <textarea value={activeTemplate} onChange={(event) => setTemplate(event.target.value)} />
          </label>
          <div className="template-actions">
            <button type="button" onClick={() => setTemplate(payload.default_template || "")}>
              Reset template
            </button>
          </div>
        </div>
      </div>

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
          <button type="button" onClick={sendBulkAlerts} disabled={!selectedReadyRows.length || bulkSending || medium === "whatsapp"}>
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
                        disabled={!row.bill_id || !row.contacts?.[medium]?.ready || sendingId === row.customer_id || medium === "whatsapp"}
                        title={medium === "whatsapp" ? "WhatsApp sending will be added in a later slice" : `Send ${medium} alert`}
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
    </section>
  );
}

export default CommunicationsPage;
