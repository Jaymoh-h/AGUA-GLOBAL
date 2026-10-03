import ReportPrintHeader from "./ReportPrintHeader";
import { productionHostSetupItems } from "./ProductionHostSetupPanel";
import { assetUrl } from "../services/api";

const commissioningGates = [
  ["messaging_email", "Email delivery", "Delivered test email using the approved sender and recipient."],
  ["messaging_sms", "SMS delivery", "Delivered test SMS using the approved sender and recipient."],
  ["messaging_whatsapp", "WhatsApp delivery", "Delivered approved-template message using the provider test recipient."],
  ["mpesa_settlement", "M-Pesa settlement", "Reconciled provider settlement statement to posted receipts."],
  ["bank_feed", "Bank feed", "Reconciled a non-production API, host-to-host, or SFTP feed."],
  ["database_resilience", "Database resilience", "Verified the selected provider's recovery and failover evidence."],
  ["external_uptime", "External uptime", "Exercised an outside monitor against /api/status and verified alert routing."]
];

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "-");

function CommissioningHandoverPrint({ active, businessSettings, commissioningChecks, generatedAt, readiness }) {
  const latestEvidence = new Map();
  (commissioningChecks || []).forEach((check) => {
    if (!latestEvidence.has(check.check_key)) latestEvidence.set(check.check_key, check);
  });
  const gates = commissioningGates.map(([checkKey, title, completionGate]) => ({
    checkKey,
    title,
    completionGate,
    evidence: latestEvidence.get(checkKey) || null
  }));
  const passedCount = gates.filter((gate) => gate.evidence?.status === "passed").length;
  const hostChecks = productionHostSetupItems(readiness);

  return (
    <section className={`panel print-surface report-print commissioning-print ${active ? "active-print-surface" : ""}`.trim()}>
      <ReportPrintHeader
        assetUrl={assetUrl}
        businessSettings={businessSettings}
        printedAt={formatDate(generatedAt)}
        reportPeriod="Production commissioning"
        reportTitle="Integration handover"
      />
      <div className="receipt-info-grid commissioning-print-summary">
        <div><span>Commissioning gates</span><strong>{gates.length}</strong></div>
        <div><span>Passed with evidence</span><strong>{passedCount}</strong></div>
        <div><span>Outstanding</span><strong>{gates.length - passedCount}</strong></div>
        <div><span>Secret handling</span><strong>Host secret manager only</strong></div>
      </div>

      <section className="report-section commissioning-print-section">
        <h3>Commissioning gates</h3>
        <div className="table-wrap"><table><thead><tr><th>Dependency</th><th>Outcome</th><th>Verified</th><th>Evidence reference</th><th>Completion proof</th></tr></thead><tbody>
          {gates.map((gate) => <tr key={gate.checkKey}>
            <td>{gate.title}</td>
            <td>{gate.evidence?.status || "Not recorded"}</td>
            <td>{gate.evidence?.verification_date || "-"}</td>
            <td>{gate.evidence?.evidence_reference || "-"}</td>
            <td>{gate.completionGate}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="report-section commissioning-print-section">
        <h3>Production-host setup</h3>
        <p>Store values only in the production host&apos;s secret manager. This handover lists variable names and redacted runtime state; it excludes passwords, tokens, provider keys, and connection strings.</p>
        <div className="table-wrap"><table><thead><tr><th>Integration</th><th>Runtime state</th><th>Host environment variable names</th><th>Next commissioning step</th></tr></thead><tbody>
          {hostChecks.map((item) => <tr key={item.key}>
            <td>{item.title}</td>
            <td>{item.external ? "Verify externally" : item.configured ? "Configured" : "Needs setup"}</td>
            <td className="commissioning-print-variables">{item.variables.length ? item.variables.join(", ") : "No direct credential is supported"}</td>
            <td>{item.nextStep}</td>
          </tr>)}
        </tbody></table></div>
      </section>
      <div className="report-print-footer"><small>{businessSettings?.business_name || "Water Billing"} integration handover | Generated {formatDate(generatedAt)}</small></div>
    </section>
  );
}

export default CommissioningHandoverPrint;
