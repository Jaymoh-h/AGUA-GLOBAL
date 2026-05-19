import { useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import AuditTrailPage from "./pages/AuditTrailPage";
import BillsPage from "./pages/BillsPage";
import BillingSetupPage from "./pages/BillingSetupPage";
import BusinessSettingsPage from "./pages/BusinessSettingsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import ExpensesPage from "./pages/ExpensesPage";
import LoginPage from "./pages/LoginPage";
import MaintenancePage from "./pages/MaintenancePage";
import PaymentsPage from "./pages/PaymentsPage";
import PasswordChangePage from "./pages/PasswordChangePage";
import PortalPage from "./pages/PortalPage";
import RatesPage from "./pages/RatesPage";
import ReadingsPage from "./pages/ReadingsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import ZonesPage from "./pages/ZonesPage";
import { api } from "./services/api";

const access = {
  portal: ["customer"],
  dashboard: ["admin", "meter_reader", "accountant"],
  customers: ["admin", "meter_reader", "accountant"],
  readings: ["admin", "meter_reader"],
  bills: ["admin", "accountant", "customer"],
  billing: ["admin", "accountant"],
  business: ["admin", "accountant"],
  audit: ["admin", "accountant"],
  payments: ["admin", "accountant"],
  expenses: ["admin", "accountant"],
  maintenance: ["admin", "accountant", "meter_reader"],
  reports: ["admin", "accountant"],
  rates: ["admin", "accountant"],
  zones: ["admin", "accountant"],
  users: ["admin"]
};

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
    portal: <PortalPage user={user} />,
    dashboard: <DashboardPage user={user} />,
    customers: <CustomersPage user={user} />,
    readings: <ReadingsPage user={user} />,
    bills: <BillsPage user={user} />,
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
      {pages[currentPage] || pages.dashboard}
    </Layout>
  );
}

export default App;
