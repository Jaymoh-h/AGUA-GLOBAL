import { CircleAlert, Download, ServerCog, ShieldCheck } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

const configuredState = (value) => (value ? "Configured" : "Needs setup");

export const productionHostSetupItems = (readiness = {}) => {
  const currentReadiness = readiness || {};
  const messaging = currentReadiness.messaging || {};
  const payments = currentReadiness.payments || {};
  const operations = currentReadiness.operations || {};

  return [
    {
      key: "email",
      title: "Email delivery",
      configured: Boolean(messaging.email?.configured),
      variables: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
      nextStep: "Store the approved SMTP sender credentials in the production host, then send and retain an external delivery test."
    },
    {
      key: "sms",
      title: "SMS delivery",
      configured: Boolean(messaging.sms?.configured),
      variables: ["SMS_PROVIDER", "SMS_DEFAULT_COUNTRY_CODE", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID", "AT_USERNAME", "AT_API_KEY", "AT_SENDER_ID"],
      nextStep: "Set only the variables required by the selected Twilio or Africa's Talking provider, then retain the provider delivery result."
    },
    {
      key: "whatsapp",
      title: "WhatsApp delivery",
      configured: Boolean(messaging.whatsapp?.configured),
      variables: ["WHATSAPP_PROVIDER", "WHATSAPP_DEFAULT_COUNTRY_CODE", "WHATSAPP_TWILIO_ACCOUNT_SID", "WHATSAPP_TWILIO_AUTH_TOKEN", "WHATSAPP_TWILIO_FROM", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_API_VERSION"],
      nextStep: "Set variables for the selected Twilio or Meta provider and verify an approved-template delivery to an approved recipient."
    },
    {
      key: "mpesa",
      title: "M-Pesa callback",
      configured: Boolean(payments.mpesa?.direct_posting_ready),
      variables: ["MPESA_CALLBACK_TOKEN"],
      nextStep: "Keep the callback token in the host secret manager. Configure the paybill in Business Settings, then verify a guarded non-production callback."
    },
    {
      key: "uptime",
      title: "External uptime and alerts",
      configured: Boolean(operations.public_status_url_configured),
      variables: ["PUBLIC_STATUS_URL", "MONITORING_CRON_SECRET or CRON_SECRET", "MONITORING_ALERT_EMAILS", "MONITORING_ALERT_PHONES"],
      nextStep: "Configure the independent monitor and alert route with its provider, then exercise it against the public /api/status endpoint."
    },
    {
      key: "database",
      title: "Database resilience",
      configured: false,
      external: true,
      variables: ["DATABASE_URL", "DATABASE_SSL", "DATABASE_SSL_REJECT_UNAUTHORIZED"],
      nextStep: "Use the managed database provider's secret store and retain point-in-time recovery and failover evidence in its control plane."
    },
    {
      key: "bank",
      title: "Bank feed",
      configured: false,
      external: true,
      variables: [],
      nextStep: "No direct bank credential is supported yet. Add provider-specific host secrets only after a bank API, SFTP, or host-to-host contract and test feed are available."
    }
  ];
};

function ProductionHostSetupPanel({ loading, onDownload, readiness }) {
  const items = productionHostSetupItems(readiness);
  const configuredCount = items.filter((item) => item.configured).length;

  return (
    <CollapsibleSection
      actions={<button type="button" onClick={onDownload} disabled={loading}><Download size={17} />Host checklist</button>}
      className="production-host-setup-panel"
      icon={<ServerCog size={18} />}
      summary={`${configuredCount}/${items.length} host checks configured`}
      title="Production Host Setup"
    >
      <p className="muted">Enter values only in the production host&apos;s secret manager. This workspace never displays, stores, or accepts integration secret values.</p>
      <div className="production-host-setup-list">
        {items.map((item) => (
          <article className="production-host-setup-item" key={item.key}>
            <div className="production-host-setup-heading">
              <div>
                {item.configured ? <ShieldCheck size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
                <strong>{item.title}</strong>
              </div>
              <span className={`status status-${item.external ? "review" : item.configured ? "ready" : "pending"}`}>{item.external ? "Verify externally" : configuredState(item.configured)}</span>
            </div>
            {item.variables.length ? <div className="production-host-variable-list" aria-label={`${item.title} environment variables`}>{item.variables.map((variable) => <code key={variable}>{variable}</code>)}</div> : null}
            <small>{item.nextStep}</small>
          </article>
        ))}
      </div>
    </CollapsibleSection>
  );
}

export default ProductionHostSetupPanel;
