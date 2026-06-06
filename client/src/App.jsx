import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import Layout, { pageAccess as access } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import PasswordChangePage from "./pages/PasswordChangePage";
import { api, setFutureDateOverrideHandler } from "./services/api";

const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage"));
const BillsPage = lazy(() => import("./pages/BillsPage"));
const BillingSetupPage = lazy(() => import("./pages/BillingSetupPage"));
const BusinessSettingsPage = lazy(() => import("./pages/BusinessSettingsPage"));
const CommunicationsPage = lazy(() => import("./pages/CommunicationsPage"));
const ContractorInvoicesPage = lazy(() => import("./pages/ContractorInvoicesPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const PayrollPage = lazy(() => import("./pages/PayrollPage"));
const PortalPage = lazy(() => import("./pages/PortalPage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const RatesPage = lazy(() => import("./pages/RatesPage"));
const ReadingsPage = lazy(() => import("./pages/ReadingsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const ZonesPage = lazy(() => import("./pages/ZonesPage"));

const getSavedUser = () => {
  const saved = localStorage.getItem("agua_user");
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    return parsed?.role ? parsed : null;
  } catch (_error) {
    localStorage.removeItem("agua_user");
    localStorage.removeItem("agua_token");
    return null;
  }
};

const IDLE_LOGOUT_MS = 30 * 60 * 1000;

function App() {
  const [user, setUser] = useState(getSavedUser);
  const [currentPage, setCurrentPage] = useState(() => (getSavedUser()?.role === "customer" ? "portal" : "dashboard"));
  const [navigationIntent, setNavigationIntent] = useState(null);
  const [appName, setAppName] = useState("Water Billing");
  const [sessionMessage, setSessionMessage] = useState("");
  const [futureDateOverride, setFutureDateOverride] = useState(null);

  const allowedPages = useMemo(() => {
    if (!user) return [];
    return Object.entries(access)
      .filter(([, roles]) => roles.includes(user.role))
      .map(([page]) => page);
  }, [user]);

  useEffect(() => {
    if (user && !allowedPages.includes(currentPage)) {
      setCurrentPage(user.role === "customer" ? "portal" : "dashboard");
    }
  }, [allowedPages, currentPage, user]);

  useEffect(() => {
    api.businessSettings
      .public()
      .then((settings) => {
        const businessName = settings?.business_name?.trim();
        if (businessName) {
          setAppName(businessName);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  useEffect(() => {
    const cleanup = setFutureDateOverrideHandler(
      ({ message }) =>
        new Promise((resolve) => {
          setFutureDateOverride({ message, resolve });
        })
    );
    return cleanup;
  }, []);

  const closeFutureDateOverride = (reason = "") => {
    const resolve = futureDateOverride?.resolve;
    setFutureDateOverride(null);
    if (resolve) resolve(reason);
  };

  useEffect(() => {
    if (!user) return undefined;

    let timeoutId;
    const resetIdleTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleLogout("You were signed out after 30 minutes of inactivity.");
      }, IDLE_LOGOUT_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "focus"];
    events.forEach((eventName) => window.addEventListener(eventName, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimer));
    };
  }, [user]);

  const handleLogin = ({ token, user: nextUser }) => {
    localStorage.setItem("agua_token", token);
    localStorage.setItem("agua_user", JSON.stringify(nextUser));
    setSessionMessage("");
    setUser(nextUser);
    if (nextUser.role === "customer") {
      setCurrentPage("portal");
    }
  };

  const handleNavigate = (target) => {
    if (typeof target === "string") {
      setNavigationIntent(null);
      setCurrentPage(target);
      return;
    }
    if (!target?.page) return;
    setNavigationIntent(target);
    setCurrentPage(target.page);
  };

  const clearNavigationIntent = () => setNavigationIntent(null);

  const handleLogout = (message = "") => {
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");
    setSessionMessage(typeof message === "string" ? message : "");
    setUser(null);
    setCurrentPage("dashboard");
  };

  const handlePasswordChanged = (nextUser) => {
    localStorage.setItem("agua_user", JSON.stringify(nextUser));
    setUser(nextUser);
    setCurrentPage(nextUser.role === "customer" ? "portal" : "dashboard");
  };

  if (!user) {
    return <LoginPage appName={appName} onLogin={handleLogin} sessionMessage={sessionMessage} />;
  }

  if (user.must_change_password) {
    return <PasswordChangePage user={user} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  const pages = {
    portal: <PortalPage user={user} view="overview" />,
    dashboard: <DashboardPage user={user} onNavigate={handleNavigate} />,
    customers: <CustomersPage user={user} />,
    readings: <ReadingsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    bills: user.role === "customer" ? <PortalPage user={user} view="bills" /> : <BillsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    receipts: <PortalPage user={user} view="receipts" />,
    requests: <PortalPage user={user} view="requests" />,
    billing: <BillingSetupPage user={user} onNavigate={handleNavigate} />,
    business: <BusinessSettingsPage user={user} />,
    communications: <CommunicationsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    audit: <AuditTrailPage user={user} />,
    payments: <PaymentsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    expenses: <ExpensesPage user={user} />,
    contractors: <ContractorInvoicesPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    payroll: <PayrollPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    maintenance: <MaintenancePage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    production: <ProductionPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    reports: <ReportsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    rates: <RatesPage user={user} />,
    zones: <ZonesPage user={user} />,
    users: <UsersPage user={user} />
  };

  return (
    <Layout appName={appName} user={user} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout}>
      <Suspense
        fallback={
          <div className="panel">
            <EmptyPageMessage />
          </div>
        }
      >
        {pages[currentPage] || pages.dashboard}
      </Suspense>
      {futureDateOverride ? (
        <FutureDateOverrideDialog
          message={futureDateOverride.message}
          onCancel={() => closeFutureDateOverride("")}
          onSubmit={closeFutureDateOverride}
        />
      ) : null}
    </Layout>
  );
}

function FutureDateOverrideDialog({ message, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal-panel override-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="future-date-override-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmedReason) onSubmit(trimmedReason);
        }}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin Override</p>
            <h3 id="future-date-override-title">Future-dated record</h3>
          </div>
        </div>
        <p className="muted">{message}</p>
        <label>
          Override reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows="4"
            autoFocus
            placeholder="Explain why this future-dated record is valid."
            required
          />
        </label>
        <div className="row-actions">
          <button className="primary-button" type="submit" disabled={!trimmedReason}>
            Continue
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyPageMessage() {
  return (
    <div className="empty-state">
      <strong>Loading page</strong>
      <span>Please wait.</span>
    </div>
  );
}

export default App;
