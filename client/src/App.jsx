import { useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import BillsPage from "./pages/BillsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PaymentsPage from "./pages/PaymentsPage";
import RatesPage from "./pages/RatesPage";
import ReadingsPage from "./pages/ReadingsPage";
import UsersPage from "./pages/UsersPage";
import ZonesPage from "./pages/ZonesPage";

const access = {
  dashboard: ["admin", "meter_reader", "accountant", "customer"],
  customers: ["admin", "meter_reader", "accountant", "customer"],
  readings: ["admin", "meter_reader"],
  bills: ["admin", "accountant", "customer"],
  payments: ["admin", "accountant"],
  rates: ["admin", "accountant"],
  zones: ["admin", "accountant"],
  users: ["admin"]
};

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("agua_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [currentPage, setCurrentPage] = useState("dashboard");

  const allowedPages = useMemo(() => {
    if (!user) return [];
    return Object.entries(access)
      .filter(([, roles]) => roles.includes(user.role))
      .map(([page]) => page);
  }, [user]);

  useEffect(() => {
    if (user && !allowedPages.includes(currentPage)) {
      setCurrentPage("dashboard");
    }
  }, [allowedPages, currentPage, user]);

  const handleLogin = ({ token, user: nextUser }) => {
    localStorage.setItem("agua_token", token);
    localStorage.setItem("agua_user", JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const handleLogout = () => {
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");
    setUser(null);
    setCurrentPage("dashboard");
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const pages = {
    dashboard: <DashboardPage user={user} />,
    customers: <CustomersPage user={user} />,
    readings: <ReadingsPage user={user} />,
    bills: <BillsPage user={user} />,
    payments: <PaymentsPage user={user} />,
    rates: <RatesPage user={user} />,
    zones: <ZonesPage user={user} />,
    users: <UsersPage user={user} />
  };

  return (
    <Layout user={user} currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout}>
      {pages[currentPage] || pages.dashboard}
    </Layout>
  );
}

export default App;
