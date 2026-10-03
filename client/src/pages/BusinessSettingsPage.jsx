import { Building2, Save, Settings2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import BusinessOperationsWorkspace from "../components/BusinessOperationsWorkspace";
import CommissioningHandoverPrint from "../components/CommissioningHandoverPrint";
import CollapsibleSection from "../components/CollapsibleSection";
import IntegrationReadinessPanel from "../components/IntegrationReadinessPanel";
import ProductionHostSetupPanel, { productionHostSetupItems } from "../components/ProductionHostSetupPanel";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api, assetUrl } from "../services/api";
import { downloadJson } from "../utils/csvTemplate";
import { localDateStamp, namedExport, withPrintTitle } from "../utils/exportNames";

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
const commissioningGates = [
  ["messaging_email", "Email delivery", "Delivered test email using the approved sender and recipient."],
  ["messaging_sms", "SMS delivery", "Delivered test SMS using the approved sender and recipient."],
  ["messaging_whatsapp", "WhatsApp delivery", "Delivered approved-template message using the provider test recipient."],
  ["mpesa_settlement", "M-Pesa settlement", "Reconciled provider settlement statement to posted receipts."],
  ["bank_feed", "Bank feed", "Reconciled a non-production API, host-to-host, or SFTP feed."],
  ["database_resilience", "Database resilience", "Verified the selected provider's recovery and failover evidence."],
  ["external_uptime", "External uptime", "Exercised an outside monitor against /api/status and verified alert routing."]
];

function BusinessSettingsPage({ user }) {
  const [settings, setSettings] = useState(blankSettings);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
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
  const [integrationReadiness, setIntegrationReadiness] = useState(null);
  const [integrationReadinessLoading, setIntegrationReadinessLoading] = useState(false);
  const [commissioningChecks, setCommissioningChecks] = useState([]);
  const [commissioningChecksLoading, setCommissioningChecksLoading] = useState(false);
  const [commissioningPrintActive, setCommissioningPrintActive] = useState(false);
  const [commissioningPrintGeneratedAt, setCommissioningPrintGeneratedAt] = useState("");
  const [localNow, setLocalNow] = useState(() => new Date());
  const [, setMessage] = useToastMessage();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const canEdit = user.role === "admin";
  const canSendReminders = ["admin", "accountant"].includes(user.role);
  const canViewMonitoring = ["admin", "accountant", "business_viewer"].includes(user.role);
  const monitoringSummary = monitoring?.summary || {};
  const reminderDueGroups = (reminderPreview?.reminders || []).filter((item) => item.hasWork && item.dueToday).length;
  const reminderPendingItems = (reminderPreview?.reminders || []).reduce((sum, item) => sum + Number(item.count || 0), 0);

  const applySettings = (row) =>
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
    });

  const loadInitialWorkspace = async () => {
    setInitialLoading(true);
    setInitialError("");
    try {
      applySettings(await api.businessSettings.get());
      setMessage("");
    } catch (err) {
      setInitialError(err.message || "Business settings could not be loaded.");
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialWorkspace();
    api.billing.settings.get().then(setBillingSettings).catch(() => {});
    loadIntegrationReadiness();
    loadCommissioningChecks();
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
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
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

  const loadIntegrationReadiness = async () => {
    setIntegrationReadinessLoading(true);
    try {
      setIntegrationReadiness(await api.businessSettings.integrationReadiness());
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIntegrationReadinessLoading(false);
    }
  };

  const loadCommissioningChecks = async () => {
    setCommissioningChecksLoading(true);
    try {
      setCommissioningChecks(await api.businessSettings.commissioningChecks());
    } catch (err) {
      setMessage(err.message);
    } finally {
      setCommissioningChecksLoading(false);
    }
  };

  const recordCommissioningCheck = async (payload) => {
    setMessage("");
    try {
      const created = await api.businessSettings.recordCommissioningCheck(payload);
      setCommissioningChecks((current) => [created, ...current].slice(0, 80));
      setMessage("Commissioning evidence recorded.");
      return created;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  };

  const downloadCommissioningPacket = () => {
    const latestEvidence = new Map();
    commissioningChecks.forEach((check) => {
      if (!latestEvidence.has(check.check_key)) latestEvidence.set(check.check_key, check);
    });
    const gates = commissioningGates.map(([checkKey, title, completionGate]) => {
      const evidence = latestEvidence.get(checkKey) || null;
      return {
        check_key: checkKey,
        title,
        completion_gate: completionGate,
        latest_outcome: evidence?.status || "not_recorded",
        latest_evidence: evidence
      };
    });
    const passedCount = gates.filter((gate) => gate.latest_outcome === "passed").length;

    downloadJson(namedExport("commissioning-packet", "json", [localDateStamp()]), {
      packet_type: "AGUA Global commissioning packet",
      generated_at: new Date().toISOString(),
      organization: {
        business_name: settings.business_name || null,
        legal_name: settings.legal_name || null
      },
      summary: {
        gates_total: gates.length,
        gates_passed: passedCount,
        gates_remaining: gates.length - passedCount
      },
      configuration_readiness: integrationReadiness,
      commissioning_gates: gates
    });
    setMessage(`Commissioning packet downloaded with ${passedCount}/${gates.length} passed gate(s).`);
  };

  const downloadProductionHostChecklist = () => {
    const hostChecks = productionHostSetupItems(integrationReadiness).map((item) => ({
      integration: item.title,
      runtime_status: item.external ? "verify_externally" : item.configured ? "configured" : "needs_setup",
      host_environment_variable_names: item.variables,
      commissioning_step: item.nextStep
    }));
    downloadJson(namedExport("production-host-integration-checklist", "json", [localDateStamp()]), {
      checklist_type: "AGUA Global production-host integration setup",
      generated_at: new Date().toISOString(),
      organization: {
        business_name: settings.business_name || null,
        legal_name: settings.legal_name || null
      },
      secret_handling: "Store values exclusively in the production host secret manager. This export contains variable names and redacted runtime status only.",
      host_checks: hostChecks
    });
    setMessage("Production-host setup checklist downloaded.");
  };

  const printCommissioningHandover = () => {
    if (!integrationReadiness) return;
    const generatedAt = new Date().toISOString();
    flushSync(() => {
      setCommissioningPrintGeneratedAt(generatedAt);
      setCommissioningPrintActive(true);
    });
    const clearPrintSurface = () => setCommissioningPrintActive(false);
    window.addEventListener("afterprint", clearPrintSurface, { once: true });
    window.setTimeout(clearPrintSurface, 60000);
    withPrintTitle("integration commissioning handover", () => window.print(), settings);
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

  const resolveMonitoringEvent = async (event, resolutionNotes) => {
    setMessage("");
    try {
      await api.monitoring.resolveEvent(event.id, { resolution_notes: resolutionNotes });
      setMessage("Monitoring event resolved and audited.");
      await loadMonitoring();
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    }
  };

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving organization, print, and operational configuration." title="Preparing business settings" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={loadInitialWorkspace}
        state="error"
        title="Business settings could not load"
      />
    );
  }

  return (
    <section className="page-stack operations-readiness-page">
      <header className="page-header operations-readiness-header">
        <div>
          <p className="eyebrow">Organization</p>
          <h2>Operations readiness</h2>
          <p>Keep the operating platform healthy, configure customer-facing details, and maintain a recoverable business record.</p>
        </div>
      </header>

      <section className="operations-readiness-metrics" aria-label="Operations readiness">
        <div className={Number(monitoringSummary.unresolved_errors || 0) ? "needs-attention" : ""}>
          <span>Platform health</span>
          <strong>{monitoring ? `${monitoring.api || "API"} / ${monitoring.database || "DB"}` : "Checking"}</strong>
          <small>{number(monitoringSummary.unresolved_errors)} unresolved event{Number(monitoringSummary.unresolved_errors || 0) === 1 ? "" : "s"}</small>
        </div>
        <div className={Number(monitoringSummary.unresolved_errors || 0) ? "needs-attention" : ""}>
          <span>Errors in 24 hours</span>
          <strong>{number(monitoringSummary.errors_24h)}</strong>
          <small>{number(monitoringSummary.login_failures_24h)} login failure{Number(monitoringSummary.login_failures_24h || 0) === 1 ? "" : "s"}</small>
        </div>
        <div className={reminderDueGroups ? "needs-attention" : ""}>
          <span>Reminders due</span>
          <strong>{number(reminderDueGroups)}</strong>
          <small>{number(reminderPendingItems)} pending work item{reminderPendingItems === 1 ? "" : "s"}</small>
        </div>
        <div className={backupStatus?.restore_drill_status === "passed" ? "" : "needs-attention"}>
          <span>Recovery posture</span>
          <strong>{backupStatus?.restore_drill_status || "Not recorded"}</strong>
          <small>{backupStatus?.next_restore_drill_due ? `Next drill ${backupStatus.next_restore_drill_due}` : "Record a restore drill"}</small>
        </div>
      </section>

      <section className="business-settings-grid operations-readiness-workspace">
        <IntegrationReadinessPanel
          canEdit={canEdit}
          checksLoading={commissioningChecksLoading}
          commissioningChecks={commissioningChecks}
          defaultOpen={false}
          loading={integrationReadinessLoading}
          onDownloadPacket={downloadCommissioningPacket}
          onPrintHandover={printCommissioningHandover}
          onRecordCheck={recordCommissioningCheck}
          onRefresh={loadIntegrationReadiness}
          onRefreshChecks={loadCommissioningChecks}
          readiness={integrationReadiness}
        />

        <ProductionHostSetupPanel
          loading={integrationReadinessLoading}
          onDownload={downloadProductionHostChecklist}
          readiness={integrationReadiness}
        />

        <CommissioningHandoverPrint
          active={commissioningPrintActive}
          businessSettings={settings}
          commissioningChecks={commissioningChecks}
          generatedAt={commissioningPrintGeneratedAt}
          readiness={integrationReadiness}
        />

        <CollapsibleSection
          as="form"
          className="form-grid"
          defaultOpen={false}
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
          <BusinessOperationsWorkspace
          backupLoading={backupLoading}
          backupStatus={backupStatus}
          browserDateTime={browserDateTime}
          canEdit={canEdit}
          canSendReminders={canSendReminders}
          canViewMonitoring={canViewMonitoring}
          label={label}
          localNow={localNow}
          monitoring={monitoring}
          monitoringAlertSnapshot={monitoringAlertSnapshot}
          monitoringLoading={monitoringLoading}
          monitoringSummary={monitoringSummary}
          number={number}
          onDownloadBackup={downloadBackupPack}
          onLoadMonitoring={loadMonitoring}
          onLoadReminders={loadOperationalReminders}
          onRecordRestoreDrill={recordRestoreDrill}
          onResolveMonitoringEvent={resolveMonitoringEvent}
          onRefreshBackupStatus={() => api.reports.backupStatus().then(setBackupStatus).catch((err) => setMessage(err.message))}
          onSendMonitoringTestAlert={sendMonitoringTestAlert}
          onSendReminders={sendOperationalReminders}
          onSetRestoreDrillField={setRestoreDrillField}
          reminderLoading={reminderLoading}
          reminderLogs={reminderLogs}
          reminderPreview={reminderPreview}
          reminderSending={reminderSending}
          restoreDrillForm={restoreDrillForm}
          restoreDrills={restoreDrills}
            shortDateTime={shortDateTime}
          />

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
