import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import Layout, { pageAccess as access } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import PasswordChangePage from "./pages/PasswordChangePage";
import { api } from "./services/api";

const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage"));
const BillsPage = lazy(() => import("./pages/BillsPage"));
const BillingSetupPage = lazy(() => import("./pages/BillingSetupPage"));
const BusinessSettingsPage = lazy(() => import("./pages/BusinessSettingsPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const PortalPage = lazy(() => import("./pages/PortalPage"));
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

function App() {
  const [user, setUser] = useState(getSavedUser);
  const [currentPage, setCurrentPage] = useState(() => (getSavedUser()?.role === "customer" ? "portal" : "dashboard"));
  const [appName, setAppName] = useState("Water Billing");

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

  const handleLogin = ({ token, user: nextUser }) => {
    localStorage.setItem("agua_token", token);
    localStorage.setItem("agua_user", JSON.stringify(nextUser));
    setUser(nextUser);
    if (nextUser.role === "customer") {
      setCurrentPage("portal");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");
    setUser(null);
    setCurrentPage("dashboard");
  };

  const handlePasswordChanged = (nextUser) => {
    localStorage.setItem("agua_user", JSON.stringify(nextUser));
    setUser(nextUser);
    setCurrentPage(nextUser.role === "customer" ? "portal" : "dashboard");
  };

  if (!user) {
    return <LoginPage appName={appName} onLogin={handleLogin} />;
  }

  if (user.must_change_password) {
    return <PasswordChangePage user={user} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  const pages = {
    portal: <PortalPage user={user} view="overview" />,
    dashboard: <DashboardPage user={user} />,
    customers: <CustomersPage user={user} />,
    readings: <ReadingsPage user={user} />,
    bills: user.role === "customer" ? <PortalPage user={user} view="bills" /> : <BillsPage user={user} />,
    receipts: <PortalPage user={user} view="receipts" />,
    requests: <PortalPage user={user} view="requests" />,
    billing: <BillingSetupPage user={user} />,
    business: <BusinessSettingsPage user={user} />,
    audit: <AuditTrailPage user={user} />,
    payments: <PaymentsPage user={user} />,
    expenses: <ExpensesPage user={user} />,
    maintenance: <MaintenancePage user={user} />,
    reports: <ReportsPage user={user} />,
    rates: <RatesPage user={user} />,
    zones: <ZonesPage user={user} />,
    users: <UsersPage user={user} />
  };

  return (
    <Layout appName={appName} user={user} currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout}>
      <Suspense
        fallback={
          <div className="panel">
            <EmptyPageMessage />
          </div>
        }
      >
        {pages[currentPage] || pages.dashboard}
      </Suspense>
    </Layout>
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
