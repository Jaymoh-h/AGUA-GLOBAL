import { Activity, Bell, Building2, Clock, Download, MailCheck, RefreshCw, Save, Send, Settings2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { EmptyTableRow } from "../components/EmptyState";
import StatCard from "../components/StatCard";
import { useToastMessage } from "../components/ToastProvider";
import { api, assetUrl } from "../services/api";
import { downloadJson } from "../utils/csvTemplate";
import { localDateStamp, namedExport } from "../utils/exportNames";

const blankSettings = {
  business_name: "",
  legal_name: "",
  logo_url: "",
  phone: "",
  email: "",
  physical_address: "",
  postal_address: "",
  tax_pin: "",
  paybill_number: "",
  till_number: "",
  bank_details: "",
  receipt_footer_note: "",
  report_footer_note: "",
  default_currency: "KES",
  print_page_size: "A4",
  print_orientation: "portrait",
  print_margin_mm: 14,
  print_scale_percent: 100,
  print_fit_to_page: false
};

const blankRestoreDrill = {
  drill_date: new Date().toISOString().slice(0, 10),
  environment: "staging",
  backup_reference: "",
  restore_target: "",
  status: "passed",
  duration_minutes: "",
  dataset_count: "",
  findings: "",
  follow_up_actions: ""
};

const valueOrEmpty = (value) => value ?? "";
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const label = (value) => String(value || "-").replaceAll("_", " ");
const shortDateTime = (value) => (value ? new Date(value).toLocaleString() : "Never");
const browserDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

function BusinessSettingsPage({ user }) {
  const [settings, setSettings] = useState(blankSettings);
  const [billingSettings, setBillingSettings] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [restoreDrills, setRestoreDrills] = useState([]);
  const [restoreDrillForm, setRestoreDrillForm] = useState(blankRestoreDrill);
  const [reminderPreview, setReminderPreview] = useState(null);
  const [reminderLogs, setReminderLogs] = useState([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [monitoring, setMonitoring] = useState(null);
  const [monitoringAlertSnapshot, setMonitoringAlertSnapshot] = useState(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [localNow, setLocalNow] = useState(() => new Date());
  const [, setMessage] = useToastMessage();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const canEdit = user.role === "admin";
  const canSendReminders = ["admin", "accountant"].includes(user.role);
  const canViewMonitoring = ["admin", "accountant", "business_viewer"].includes(user.role);
  const monitoringSummary = monitoring?.summary || {};

  useEffect(() => {
    api.businessSettings
      .get()
      .then((row) =>
        setSettings({
          business_name: valueOrEmpty(row.business_name),
          legal_name: valueOrEmpty(row.legal_name),
          logo_url: valueOrEmpty(row.logo_url),
          phone: valueOrEmpty(row.phone),
          email: valueOrEmpty(row.email),
          physical_address: valueOrEmpty(row.physical_address),
          postal_address: valueOrEmpty(row.postal_address),
          tax_pin: valueOrEmpty(row.tax_pin),
          paybill_number: valueOrEmpty(row.paybill_number),
          till_number: valueOrEmpty(row.till_number),
          bank_details: valueOrEmpty(row.bank_details),
          receipt_footer_note: valueOrEmpty(row.receipt_footer_note),
          report_footer_note: valueOrEmpty(row.report_footer_note),
          default_currency: valueOrEmpty(row.default_currency) || "KES",
          print_page_size: valueOrEmpty(row.print_page_size) || "A4",
          print_orientation: valueOrEmpty(row.print_orientation) || "portrait",
          print_margin_mm: row.print_margin_mm ?? 14,
          print_scale_percent: row.print_scale_percent ?? 100,
          print_fit_to_page: Boolean(row.print_fit_to_page)
        })
      )
      .catch((err) => setMessage(err.message));
    api.billing.settings.get().then(setBillingSettings).catch(() => {});
    if (canEdit) {
      api.reports.backupStatus().then(setBackupStatus).catch(() => {});
      api.reports.backupRestoreDrills().then(setRestoreDrills).catch(() => {});
    }
    if (canSendReminders) {
      loadOperationalReminders();
    }
    if (canViewMonitoring) {
      loadMonitoring();
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const setField = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const setRestoreDrillField = (field, value) => setRestoreDrillForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const updated = await api.businessSettings.update(settings);
      setSettings({
        ...settings,
        ...Object.fromEntries(Object.entries(updated).map(([key, value]) => [key, valueOrEmpty(value)]))
      });
      setMessage("Business settings saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected logo file."));
      reader.readAsDataURL(file);
    });

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setUploadingLogo(true);
    try {
      const data = await readFileAsDataUrl(file);
      const updated = await api.businessSettings.uploadLogo({
        file_name: file.name,
        mime_type: file.type,
        data
      });
      setSettings({
        ...settings,
        ...Object.fromEntries(Object.entries(updated).map(([key, value]) => [key, valueOrEmpty(value)]))
      });
      setMessage("Logo uploaded.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  const downloadBackupPack = async () => {
    setMessage("");
    setBackupLoading(true);
    try {
      const backup = await api.reports.backup();
      const datasetCount = Object.keys(backup.dataset_counts || {}).length;
      downloadJson(namedExport("operational-backup-pack", "json", [localDateStamp()]), backup);
      setMessage(`Backup downloaded with ${datasetCount.toLocaleString()} dataset(s).`);
      api.reports.backupStatus().then(setBackupStatus).catch(() => {});
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const recordRestoreDrill = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const created = await api.reports.createBackupRestoreDrill(restoreDrillForm);
      setRestoreDrills((current) => [created, ...current].slice(0, 50));
      setRestoreDrillForm(blankRestoreDrill);
      api.reports.backupStatus().then(setBackupStatus).catch(() => {});
      setMessage("Restore drill recorded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const loadOperationalReminders = async () => {
    setReminderLoading(true);
    try {
      const [preview, logs] = await Promise.all([api.reminders.preview(), api.reminders.logs(12)]);
      setReminderPreview(preview);
      setReminderLogs(logs || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setReminderLoading(false);
    }
  };

  const sendOperationalReminders = async () => {
    setReminderSending(true);
    setMessage("");
    try {
      const result = await api.reminders.sendOperational();
      const sent = result.results?.filter((row) => row.status === "sent").length || 0;
      const skipped = result.results?.filter((row) => row.status === "skipped").length || 0;
      const failed = result.results?.filter((row) => row.status === "failed").length || 0;
      setMessage(`Operational reminders processed. Sent ${sent}, skipped ${skipped}, failed ${failed}.`);
      await loadOperationalReminders();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setReminderSending(false);
    }
  };

  const loadMonitoring = async () => {
    setMonitoringLoading(true);
    try {
      const [summary, alertSnapshot] = await Promise.all([
        api.monitoring.summary(),
        canEdit ? api.monitoring.alertSnapshot().catch(() => null) : Promise.resolve(null)
      ]);
      setMonitoring(summary);
      if (alertSnapshot) setMonitoringAlertSnapshot(alertSnapshot);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setMonitoringLoading(false);
    }
  };

  const sendMonitoringTestAlert = async () => {
    setMessage("");
    try {
      const result = await api.monitoring.sendTestAlert();
      setMessage(`Monitoring alert check completed: ${result.results?.length || 0} recipient(s).`);
      await loadMonitoring();
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Organization</p>
          <h2>Business Settings</h2>
        </div>
      </header>

      <section className="business-settings-grid">
        <CollapsibleSection
          as="form"
          className="form-grid"
          defaultOpen
          icon={<Building2 size={18} />}
          onSubmit={save}
          summary={`${settings.business_name || "Business profile"} | ${settings.phone || settings.email || "contacts pending"}`}
          title="Identity"
        >
          <label>
            Business name
            <input
              value={settings.business_name}
              onChange={(event) => setField("business_name", event.target.value)}
              disabled={!canEdit}
              required
            />
          </label>
          <label>
            Legal name
            <input
              value={settings.legal_name}
              onChange={(event) => setField("legal_name", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label>
            Logo URL or asset path
            <input
              value={settings.logo_url}
              onChange={(event) => setField("logo_url", event.target.value)}
              disabled={!canEdit}
              placeholder="/logo.png or https://..."
            />
          </label>
          {canEdit ? (
            <label>
              Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadLogo} disabled={uploadingLogo} />
            </label>
          ) : null}
          {settings.logo_url ? (
            <div className="logo-preview">
              <img src={assetUrl(settings.logo_url)} alt="Business logo preview" />
            </div>
          ) : null}
          <label>
            Default currency
            <input
              value={settings.default_currency}
              onChange={(event) => setField("default_currency", event.target.value.toUpperCase())}
              disabled={!canEdit}
              maxLength="10"
            />
          </label>

          <div className="panel-heading compact-heading">
            <h3>Contacts</h3>
          </div>
          <label>
            Phone
            <input value={settings.phone} onChange={(event) => setField("phone", event.target.value)} disabled={!canEdit} />
          </label>
          <label>
            Email
            <input
              value={settings.email}
              onChange={(event) => setField("email", event.target.value)}
              disabled={!canEdit}
              type="email"
            />
          </label>
          <label>
            Physical address
            <textarea
              value={settings.physical_address}
              onChange={(event) => setField("physical_address", event.target.value)}
              disabled={!canEdit}
              rows="3"
            />
          </label>
          <label>
            Postal address
            <textarea
              value={settings.postal_address}
              onChange={(event) => setField("postal_address", event.target.value)}
              disabled={!canEdit}
              rows="2"
            />
          </label>
          {canEdit ? (
            <button className="primary-button" type="submit">
              {uploadingLogo ? <Upload size={17} /> : <Save size={17} />}
              {uploadingLogo ? "Uploading logo" : "Save business settings"}
            </button>
          ) : null}
        </CollapsibleSection>

        <div className="business-ops-grid wide-panel">
          {canViewMonitoring ? (
            <CollapsibleSection
              actions={
                <>
                  <div className="browser-clock" title="Current browser/computer time">
                    <Clock size={14} />
                    <span>{browserDateTime(localNow)}</span>
                  </div>
                  <button type="button" onClick={loadMonitoring} disabled={monitoringLoading}>
                    <RefreshCw size={17} />
                    {monitoringLoading ? "Loading..." : "Refresh"}
                  </button>
                  {canEdit ? (
                    <button type="button" onClick={sendMonitoringTestAlert}>
                      <Bell size={17} />
                      Test alert
                    </button>
                  ) : null}
                </>
              }
              className="business-monitoring-panel"
              defaultOpen
              icon={<Activity size={18} />}
              summary={monitoring ? `API ${monitoring.api} | DB ${monitoring.database} | ${number(monitoringSummary.errors_24h)} errors 24h` : "Loading status"}
              title="Application Monitoring"
            >
              <p className="muted">
                {monitoring
                  ? `Checked ${browserDateTime(monitoring.checked_at)}`
                  : "Monitoring summary is loading."}
              </p>
              <div className="stat-grid compact-stat-grid">
                <StatCard label="Errors 24h" value={number(monitoringSummary.errors_24h)} detail={`${number(monitoringSummary.unresolved_errors)} unresolved`} />
                <StatCard label="Login Failures" value={number(monitoringSummary.login_failures_24h)} detail="Last 24 hours" />
                <StatCard label="API Errors" value={number(monitoringSummary.api_errors_24h)} detail="Server-side failures" />
                <StatCard label="Page Crashes" value={number(monitoringSummary.client_errors_24h)} detail="Client-side reports" />
                {canEdit ? (
                  <StatCard
                    label="Alert Window"
                    value={monitoringAlertSnapshot?.status || "-"}
                    detail={`${number(monitoringAlertSnapshot?.event_count)} event(s), DB ${monitoringAlertSnapshot?.database || "-"}`}
                  />
                ) : null}
              </div>
              <div className="table-wrap monitoring-events-table">
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
                      monitoring.recent_events.slice(0, 10).map((event) => (
                        <tr key={event.id}>
                          <td>{browserDateTime(event.created_at)}</td>
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
            </CollapsibleSection>
          ) : null}

          {canSendReminders ? (
            <CollapsibleSection
              actions={
                <>
                  <button type="button" onClick={loadOperationalReminders} disabled={reminderLoading}>
                    <RefreshCw size={17} />
                    {reminderLoading ? "Loading..." : "Refresh"}
                  </button>
                  <button type="button" onClick={sendOperationalReminders} disabled={reminderSending}>
                    <Send size={17} />
                    {reminderSending ? "Sending..." : "Send due"}
                  </button>
                </>
              }
              className="business-reminders-panel"
              icon={<Bell size={18} />}
              summary={`${number(reminderPreview?.reminders?.reduce((sum, item) => sum + Number(item.count || 0), 0))} pending item(s)`}
              title="Operational Reminders"
            >
              <p className="muted">Email nudges for pending work, meter readings, billing, and payroll preparation.</p>
              {reminderPreview?.reminders?.length ? (
                <>
                  <div className="reading-context">
                    <div>
                      <span>Due groups</span>
                      <strong>
                        {reminderPreview.reminders.filter((item) => item.hasWork && item.dueToday).length.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span>Total items</span>
                      <strong>
                        {reminderPreview.reminders
                          .reduce((sum, item) => sum + Number(item.count || 0), 0)
                          .toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span>Last checked</span>
                      <strong>{shortDateTime(reminderPreview.generated_at)}</strong>
                    </div>
                  </div>
                  <div className="reminder-card-grid">
                    {reminderPreview.reminders.map((item) => (
                      <div className={`reminder-card ${item.hasWork && item.dueToday ? "active" : ""}`} key={item.type}>
                        <div>
                          <Bell size={16} />
                          <strong>{item.label}</strong>
                        </div>
                        <span>{Number(item.count || 0).toLocaleString()} due</span>
                        <small>{item.lines?.[0] || "No pending detail."}</small>
                        <small>{item.dueToday ? "Scheduled today" : item.schedule?.cadence || "Not scheduled today"}</small>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty-state">Refresh to preview current reminder work.</p>
              )}
              <div className="panel-heading compact-heading">
                <div>
                  <h3>Recent Reminder Emails</h3>
                  <p className="muted">Daily duplicate sends are skipped per reminder type and recipient.</p>
                </div>
                <MailCheck size={18} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reminder</th>
                      <th>Recipient</th>
                      <th>Status</th>
                      <th>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminderLogs.length ? (
                      reminderLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            {log.reminder_type}
                            <small>{log.subject}</small>
                          </td>
                          <td>
                            {log.recipient_name || log.recipient_email}
                            <small>{log.recipient_email}</small>
                          </td>
                          <td>{log.status}</td>
                          <td>{shortDateTime(log.sent_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">No reminder emails have been recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          ) : null}

          {canEdit ? (
            <CollapsibleSection
              actions={
                <>
                  <button type="button" onClick={() => api.reports.backupStatus().then(setBackupStatus).catch((err) => setMessage(err.message))}>
                    <RefreshCw size={17} />
                    Status
                  </button>
                  <button type="button" onClick={downloadBackupPack} disabled={backupLoading}>
                    <Download size={17} />
                    {backupLoading ? "Preparing..." : "Download"}
                  </button>
                </>
              }
              className="business-backup-panel"
              icon={<Download size={18} />}
              summary={`${backupStatus?.status || "status pending"} | ${number(backupStatus?.dataset_count)} dataset(s) | drill ${backupStatus?.restore_drill_status || "missing"}`}
              title="Data Backup Pack"
            >
              <p className="muted">Server-generated operational export. Password hashes and reset tokens are excluded.</p>
              {backupStatus ? (
                <>
                  <div className="reading-context">
                    <div>
                      <span>Backup status</span>
                      <strong>{backupStatus.status}</strong>
                    </div>
                    <div>
                      <span>Datasets</span>
                      <strong>{Number(backupStatus.dataset_count || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>Last export</span>
                      <strong>{backupStatus.last_export?.created_at?.slice(0, 10) || "None"}</strong>
                    </div>
                    <div>
                      <span>Missing optional</span>
                      <strong>{Number(backupStatus.missing_optional_datasets?.length || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>Restore drill</span>
                      <strong>{backupStatus.restore_drill_status || "missing"}</strong>
                    </div>
                    <div>
                      <span>Next drill due</span>
                      <strong>{backupStatus.next_restore_drill_due || "Schedule now"}</strong>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <tbody>
                        <tr>
                          <td>Daily retention</td>
                          <td>{backupStatus.retention_policy?.daily || "30 days"}</td>
                        </tr>
                        <tr>
                          <td>Weekly retention</td>
                          <td>{backupStatus.retention_policy?.weekly || "12 weeks"}</td>
                        </tr>
                        <tr>
                          <td>Monthly retention</td>
                          <td>{backupStatus.retention_policy?.monthly || "24 months"}</td>
                        </tr>
                        <tr>
                          <td>Restore drill</td>
                          <td>
                            {backupStatus.retention_policy?.restore_drill || "Quarterly"}
                            <small>
                              {backupStatus.last_restore_drill
                                ? `Last ${backupStatus.last_restore_drill.status} on ${backupStatus.last_restore_drill.drill_date?.slice(0, 10)}`
                                : "No restore drill has been recorded."}
                            </small>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <form className="form-grid compact-form" onSubmit={recordRestoreDrill}>
                <div className="panel-heading compact-heading">
                  <h3>Record Restore Drill</h3>
                </div>
                <label>
                  Drill date
                  <input
                    type="date"
                    value={restoreDrillForm.drill_date}
                    onChange={(event) => setRestoreDrillField("drill_date", event.target.value)}
                  />
                </label>
                <label>
                  Environment
                  <select
                    value={restoreDrillForm.environment}
                    onChange={(event) => setRestoreDrillField("environment", event.target.value)}
                  >
                    <option value="local">Local</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </label>
                <label>
                  Status
                  <select value={restoreDrillForm.status} onChange={(event) => setRestoreDrillField("status", event.target.value)}>
                    <option value="passed">Passed</option>
                    <option value="partial">Partial</option>
                    <option value="failed">Failed</option>
                    <option value="planned">Planned</option>
                  </select>
                </label>
                <label>
                  Duration minutes
                  <input
                    type="number"
                    min="0"
                    value={restoreDrillForm.duration_minutes}
                    onChange={(event) => setRestoreDrillField("duration_minutes", event.target.value)}
                  />
                </label>
                <label>
                  Dataset count
                  <input
                    type="number"
                    min="0"
                    value={restoreDrillForm.dataset_count}
                    onChange={(event) => setRestoreDrillField("dataset_count", event.target.value)}
                  />
                </label>
                <label>
                  Backup reference
                  <input
                    value={restoreDrillForm.backup_reference}
                    onChange={(event) => setRestoreDrillField("backup_reference", event.target.value)}
                    placeholder="Backup filename, Neon restore point, or pg_dump file"
                    required
                  />
                </label>
                <label>
                  Restore target
                  <input
                    value={restoreDrillForm.restore_target}
                    onChange={(event) => setRestoreDrillField("restore_target", event.target.value)}
                    placeholder="Local DB, staging branch, or verification database"
                  />
                </label>
                <label>
                  Findings
                  <textarea
                    value={restoreDrillForm.findings}
                    onChange={(event) => setRestoreDrillField("findings", event.target.value)}
                    rows="3"
                  />
                </label>
                <label>
                  Follow-up actions
                  <textarea
                    value={restoreDrillForm.follow_up_actions}
                    onChange={(event) => setRestoreDrillField("follow_up_actions", event.target.value)}
                    rows="3"
                  />
                </label>
                <button className="primary-button" type="submit">
                  <Save size={17} />
                  Record drill
                </button>
              </form>
              <div className="panel-heading compact-heading">
                <h3>Restore Drill History</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Environment</th>
                      <th>Status</th>
                      <th>Backup</th>
                      <th>Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restoreDrills.length ? (
                      restoreDrills.slice(0, 8).map((drill) => (
                        <tr key={drill.id}>
                          <td>{drill.drill_date?.slice(0, 10)}</td>
                          <td>{drill.environment}</td>
                          <td><span className={`status status-${drill.status}`}>{drill.status}</span></td>
                          <td>
                            {drill.backup_reference}
                            <small>{drill.restore_target || ""}</small>
                          </td>
                          <td>
                            {drill.findings || "-"}
                            <small>{drill.follow_up_actions || ""}</small>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5">No restore drills have been recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          ) : null}

          {billingSettings ? (
            <CollapsibleSection
              className="business-billing-panel"
              icon={<Settings2 size={18} />}
              summary={`${billingSettings.deposit_required ? "Deposit required" : "Deposit optional"} | ${billingSettings.penalty_type} penalty`}
              title="Billing Settings Snapshot"
            >
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr>
                      <td>Deposit</td>
                      <td>
                        {billingSettings.deposit_required ? "Required" : "Optional"}
                        <small>{money(billingSettings.default_deposit_amount)}</small>
                      </td>
                    </tr>
                    <tr>
                      <td>Penalty</td>
                      <td>
                        {billingSettings.penalty_type}
                        <small>
                          {billingSettings.penalty_type === "percentage"
                            ? `${Number(billingSettings.penalty_value || 0)}%`
                            : money(billingSettings.penalty_value)}
                          {` | ${billingSettings.penalty_grace_days || 0} grace day(s)`}
                        </small>
                      </td>
                    </tr>
                    <tr>
                      <td>Bill numbering</td>
                      <td>
                        {billingSettings.bill_number_prefix || "BILL"}
                        <small>Next {billingSettings.bill_number_next || 1}</small>
                      </td>
                    </tr>
                    <tr>
                      <td>Receipt numbering</td>
                      <td>
                        {billingSettings.receipt_number_prefix || "RCPT"}
                        <small>Next {billingSettings.receipt_number_next || 1}</small>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            as="form"
            className="form-grid business-payment-panel"
            icon={<Settings2 size={18} />}
            onSubmit={save}
            summary={`${settings.paybill_number ? `Paybill ${settings.paybill_number}` : "Paybill pending"} | ${settings.print_page_size} ${settings.print_orientation}`}
            title="Payment And Print Details"
          >
            <label>
              KRA PIN / Tax number
              <input value={settings.tax_pin} onChange={(event) => setField("tax_pin", event.target.value)} disabled={!canEdit} />
            </label>
            <label>
              Paybill number
              <input
                value={settings.paybill_number}
                onChange={(event) => setField("paybill_number", event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label>
              Till number
              <input value={settings.till_number} onChange={(event) => setField("till_number", event.target.value)} disabled={!canEdit} />
            </label>
            <label>
              Bank details
              <textarea
                value={settings.bank_details}
                onChange={(event) => setField("bank_details", event.target.value)}
                disabled={!canEdit}
                rows="4"
              />
            </label>
            <label>
              Receipt footer note
              <textarea
                value={settings.receipt_footer_note}
                onChange={(event) => setField("receipt_footer_note", event.target.value)}
                disabled={!canEdit}
                rows="3"
              />
            </label>
            <label>
              Report footer note
              <textarea
                value={settings.report_footer_note}
                onChange={(event) => setField("report_footer_note", event.target.value)}
                disabled={!canEdit}
                rows="3"
              />
            </label>
            <div className="panel-heading compact-heading">
              <h3>Print Page Defaults</h3>
            </div>
            <label>
              Page size
              <select
                value={settings.print_page_size}
                onChange={(event) => setField("print_page_size", event.target.value)}
                disabled={!canEdit}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </label>
            <label>
              Orientation
              <select
                value={settings.print_orientation}
                onChange={(event) => setField("print_orientation", event.target.value)}
                disabled={!canEdit}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label>
              Margin (mm)
              <input
                type="number"
                min="5"
                max="30"
                step="1"
                value={settings.print_margin_mm}
                onChange={(event) => setField("print_margin_mm", event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label>
              Print scale (%)
              <input
                type="number"
                min="75"
                max="120"
                step="1"
                value={settings.print_scale_percent}
                onChange={(event) => setField("print_scale_percent", event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.print_fit_to_page}
                onChange={(event) => setField("print_fit_to_page", event.target.checked)}
                disabled={!canEdit}
              />
              Compress wide/long printouts
            </label>
            {canEdit ? (
              <button className="primary-button" type="submit">
                <Save size={17} />
                Save print details
              </button>
            ) : null}
          </CollapsibleSection>
        </div>
      </section>
    </section>
  );
}

export default BusinessSettingsPage;
