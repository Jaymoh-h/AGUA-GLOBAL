import { CircleAlert, Download, Link2, Printer, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import ReviewDialog from "./ReviewDialog";

const stateFor = (configured) => (configured ? "ready" : "pending");
const labelFor = (configured) => (configured ? "Configured" : "Needs setup");
const checkOptions = [
  ["messaging_email", "Email delivery"],
  ["messaging_sms", "SMS delivery"],
  ["messaging_whatsapp", "WhatsApp delivery"],
  ["mpesa_settlement", "M-Pesa settlement"],
  ["bank_feed", "Bank feed"],
  ["database_resilience", "Database resilience"],
  ["external_uptime", "External uptime"]
];
const blankCheck = () => ({
  check_key: "messaging_email",
  status: "planned",
  verification_date: new Date().toISOString().slice(0, 10),
  evidence_reference: "",
  findings: "",
  follow_up_actions: ""
});
const labelCheck = (value) => checkOptions.find(([key]) => key === value)?.[1] || String(value || "-").replaceAll("_", " ");

function IntegrationReadinessPanel({
  canEdit,
  checksLoading,
  commissioningChecks,
  defaultOpen = true,
  loading,
  onDownloadPacket,
  onPrintHandover,
  onRecordCheck,
  onRefresh,
  onRefreshChecks,
  readiness
}) {
  const [form, setForm] = useState(blankCheck);
  const [recording, setRecording] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const messaging = readiness?.messaging || {};
  const payments = readiness?.payments || {};
  const operations = readiness?.operations || {};
  const readinessChecks = [
    { key: "email", title: "Email delivery", detail: messaging.email?.configured ? `SMTP via ${messaging.email.provider}` : "SMTP host, user, and password are required.", configured: messaging.email?.configured },
    { key: "sms", title: "SMS delivery", detail: messaging.sms?.configured ? `${messaging.sms.provider} is configured.` : "Select a supported provider and add sender credentials.", configured: messaging.sms?.configured },
    { key: "whatsapp", title: "WhatsApp delivery", detail: messaging.whatsapp?.configured ? `${messaging.whatsapp.provider} is configured.` : "A Twilio or Meta business provider is required.", configured: messaging.whatsapp?.configured },
    {
      key: "mpesa",
      title: "M-Pesa callback",
      detail: payments.mpesa?.direct_posting_ready ? "Guarded callback receipt posting is available. Settlement reconciliation remains external." : "Statement reconciliation is available; callback token and business paybill are required for direct posting.",
      configured: payments.mpesa?.direct_posting_ready
    },
    { key: "bank", title: "Bank feed", detail: payments.bank_feed?.direct_feed_configured ? "A direct bank feed is configured." : "CSV and statement reconciliation are available; direct API, SFTP, or host-to-host access is pending.", configured: payments.bank_feed?.direct_feed_configured },
    { key: "uptime", title: "External uptime", detail: operations.public_status_url_configured ? "A status URL is configured; verify an external monitor and alert routing with its provider." : "Set the public status URL, then configure an external monitor and alert routing.", configured: operations.public_status_url_configured },
    { key: "resilience", title: "Database resilience", detail: "Provider-native point-in-time recovery and read-replica evidence must be verified in the hosting control plane.", configured: false, externallyManaged: true }
  ];
  const configuredCount = readinessChecks.filter((check) => check.configured).length;
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const confirmRecord = async () => {
    setRecording(true);
    try {
      const created = await onRecordCheck(form);
      if (created) {
        setForm(blankCheck());
        setReviewOpen(false);
      }
    } finally {
      setRecording(false);
    }
  };

  return (
    <CollapsibleSection
      actions={
        <>
          <button type="button" onClick={onPrintHandover} disabled={loading || checksLoading || !readiness}>
            <Printer size={17} />
            Print handover
          </button>
          <button type="button" onClick={onDownloadPacket} disabled={loading || checksLoading || !readiness}>
            <Download size={17} />
            Commissioning packet
          </button>
          <button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={17} />
            {loading ? "Checking..." : "Refresh"}
          </button>
        </>
      }
      className="integration-readiness-panel"
      defaultOpen={defaultOpen}
      icon={<Link2 size={18} />}
      summary={readiness ? `${configuredCount}/${readinessChecks.length} configured or verified` : "Checking external readiness"}
      title="Integration Readiness"
    >
      <p className="muted">Configuration evidence is redacted. Provider delivery, settlement, and hosting proofs remain external commissioning work.</p>
      <div className="readiness-list">
        {readinessChecks.map((check) => (
          <div className="readiness-check" key={check.key}>
            <div>
              {check.configured ? <ShieldCheck size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
              <strong>{check.title}</strong><small>{check.detail}</small>
            </div>
            <div className="readiness-check-meta"><span className={`status status-${check.externallyManaged ? "review" : stateFor(check.configured)}`}>{check.externallyManaged ? "Verify externally" : labelFor(check.configured)}</span></div>
          </div>
        ))}
      </div>

      <div className="panel-heading compact-heading"><div><h3>Commissioning Evidence</h3><p className="muted">Keep the external proof that supports a completed provider or hosting check.</p></div><button type="button" onClick={onRefreshChecks} disabled={checksLoading}><RefreshCw size={16} />{checksLoading ? "Loading..." : "Refresh"}</button></div>
      {canEdit ? (
        <form className="form-grid compact-form" onSubmit={(event) => { event.preventDefault(); setReviewOpen(true); }}>
          <label>Check<select value={form.check_key} onChange={(event) => setField("check_key", event.target.value)}>{checkOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Outcome<select value={form.status} onChange={(event) => setField("status", event.target.value)}><option value="planned">Planned</option><option value="passed">Passed</option><option value="partial">Partial</option><option value="failed">Failed</option></select></label>
          <label>Verification date<input type="date" value={form.verification_date} onChange={(event) => setField("verification_date", event.target.value)} required /></label>
          <label>Evidence reference<input value={form.evidence_reference} onChange={(event) => setField("evidence_reference", event.target.value)} placeholder="Provider message ID, runbook, or ticket" required={form.status === "passed"} /></label>
          <label>Findings<textarea value={form.findings} onChange={(event) => setField("findings", event.target.value)} rows="2" /></label>
          <label>Follow-up actions<textarea value={form.follow_up_actions} onChange={(event) => setField("follow_up_actions", event.target.value)} rows="2" /></label>
          <button className="primary-button" type="submit"><Save size={17} />Review record</button>
        </form>
      ) : null}
      <div className="table-wrap"><table><thead><tr><th>Check</th><th>Outcome</th><th>Verified</th><th>Evidence</th><th>Recorded by</th></tr></thead><tbody>
        {commissioningChecks?.length ? commissioningChecks.slice(0, 12).map((check) => <tr key={check.id}><td>{labelCheck(check.check_key)}<small>{check.findings || check.follow_up_actions || "-"}</small></td><td><span className={`status status-${check.status}`}>{check.status}</span></td><td>{check.verification_date?.slice(0, 10)}</td><td>{check.evidence_reference || "-"}</td><td>{check.recorded_by_name || "-"}</td></tr>) : <tr><td colSpan="5">No commissioning evidence has been recorded.</td></tr>}
      </tbody></table></div>
      <ReviewDialog
        busy={recording}
        busyLabel="Recording evidence..."
        confirmDisabled={form.status === "passed" && !form.evidence_reference.trim()}
        confirmLabel="Record evidence"
        description={`This will record a ${form.status} outcome for ${labelCheck(form.check_key)} dated ${form.verification_date}. It does not enable a provider or alter payment processing.`}
        eyebrow="Commissioning evidence"
        onCancel={() => !recording && setReviewOpen(false)}
        onConfirm={confirmRecord}
        open={reviewOpen}
        reasonLabel={null}
        title="Review commissioning record"
      >
        <div className="reading-context"><div><span>Evidence</span><strong>{form.evidence_reference || "Not supplied"}</strong></div><div><span>Follow-up</span><strong>{form.follow_up_actions || "None recorded"}</strong></div></div>
      </ReviewDialog>
    </CollapsibleSection>
  );
}

export default IntegrationReadinessPanel;
