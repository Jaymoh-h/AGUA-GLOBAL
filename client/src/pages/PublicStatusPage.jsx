import { Activity, CheckCircle2, Clock3, Database, ExternalLink, Server, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, apiBaseUrl } from "../services/api";

const formatTime = (value) => {
  if (!value) return "Not checked yet";
  return new Date(value).toLocaleString();
};

function PublicStatusPage({ appName = "Water Billing" }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.status();
      setStatus(data);
    } catch (error) {
      setStatus({
        ...(error.data || {}),
        status: error.data?.status || "degraded",
        message: error.message || "Status check failed.",
        checked_at: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const intervalId = window.setInterval(loadStatus, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const isHealthy = status?.status === "ok";
  const checks = useMemo(
    () => [
      { label: "API", value: status?.api || (isHealthy ? "ok" : "unknown"), icon: Server },
      { label: "Database", value: status?.database || "unknown", icon: Database }
    ],
    [isHealthy, status]
  );

  return (
    <main className="public-surface public-status-page">
      <nav className="public-nav" aria-label="Status navigation">
        <a href="/" className="landing-brand">
          <span className="brand-mark">
            <Activity size={22} />
          </span>
          <strong>{appName} Status</strong>
        </a>
        <a className="public-nav-link" href="/">
          Main app
          <ExternalLink size={15} />
        </a>
      </nav>

      <section className="public-hero public-status-hero">
        <div>
          <p className="eyebrow">Service status</p>
          <h1>{isHealthy ? "All monitored systems are operational" : "Some systems need attention"}</h1>
          <p>
            This page checks the public API and database connection used by the billing workspace. It refreshes automatically every minute.
          </p>
        </div>
        <div className={`public-status-ring ${isHealthy ? "is-ok" : "is-degraded"}`}>
          {isHealthy ? <CheckCircle2 size={42} /> : <XCircle size={42} />}
          <strong>{isHealthy ? "Operational" : "Degraded"}</strong>
          <span>{loading ? "Refreshing" : `Checked ${formatTime(status?.checked_at)}`}</span>
        </div>
      </section>

      <section className="public-grid">
        {checks.map((check) => {
          const Icon = check.icon;
          const ok = check.value === "ok";
          return (
            <article className="public-tile" key={check.label}>
              <Icon size={24} />
              <div>
                <span>{check.label}</span>
                <strong className={ok ? "status-text-ok" : "status-text-degraded"}>{check.value || "unknown"}</strong>
              </div>
            </article>
          );
        })}
        <article className="public-tile">
          <Clock3 size={24} />
          <div>
            <span>Response time</span>
            <strong>{status?.response_ms === undefined ? "-" : `${status.response_ms} ms`}</strong>
          </div>
        </article>
      </section>

      <section className="public-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Endpoint</p>
            <h3>Public status source</h3>
          </div>
        </div>
        <code>{apiBaseUrl}/status</code>
        {status?.message ? <p className="template-status-message error">{status.message}</p> : null}
      </section>
    </main>
  );
}

export default PublicStatusPage;
