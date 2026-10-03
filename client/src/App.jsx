import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import AppErrorBoundary from "./components/AppErrorBoundary";
import BrandLoader from "./components/BrandLoader";
import Layout, { pageAccess as access } from "./components/Layout";
import ReviewDialog from "./components/ReviewDialog";
import ToastProvider from "./components/ToastProvider";
import LandingPage from "./pages/LandingPage";
import PasswordChangePage from "./pages/PasswordChangePage";
import PublicDocsPage from "./pages/PublicDocsPage";
import PublicStatusPage from "./pages/PublicStatusPage";
import { api, clearSessionState, setFutureDateOverrideHandler } from "./services/api";

const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage"));
const BillsPage = lazy(() => import("./pages/BillsPage"));
const BillingSetupPage = lazy(() => import("./pages/BillingSetupPage"));
const BusinessSettingsPage = lazy(() => import("./pages/BusinessSettingsPage"));
const CommunicationsPage = lazy(() => import("./pages/CommunicationsPage"));
const CollectionsPage = lazy(() => import("./pages/CollectionsPage"));
const ContractorInvoicesPage = lazy(() => import("./pages/ContractorInvoicesPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const KnowledgeBasePage = lazy(() => import("./pages/KnowledgeBasePage"));
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

const IDLE_LOGOUT_MS = 30 * 60 * 1000;

const defaultPageForRole = (role) => ({
  admin: "dashboard",
  accountant: "collections",
  meter_reader: "readings",
  business_viewer: "reports",
  customer: "portal"
}[role] || "dashboard");

const readAppRoute = () => {
  const fragment = window.location.hash.replace(/^#\/?/, "");
  if (!fragment) return null;

  const [rawPage, rawSearch = ""] = fragment.split("?", 2);
  let page = "";
  try {
    page = decodeURIComponent(rawPage || "");
  } catch (_error) {
    return null;
  }
  if (!/^[a-z_]+$/.test(page)) return null;

  const intent = Object.fromEntries(
    [...new URLSearchParams(rawSearch).entries()]
      .filter(([key, value]) => key !== "label" && /^[a-z][a-z0-9_]*$/i.test(key) && value.length <= 120)
  );
  if (intent.return_page && /^[a-z_]+$/.test(intent.return_page)) {
    intent.return_target = {
      page: intent.return_page,
      ...(intent.return_focus ? { focus: intent.return_focus } : {}),
      ...(intent.return_customer_id ? { customer_id: intent.return_customer_id } : {})
    };
    delete intent.return_page;
    delete intent.return_focus;
    delete intent.return_customer_id;
  }
  return { page, intent: Object.keys(intent).length ? { page, ...intent } : null };
};

const writeAppRoute = (page, intent = null, { replace = false } = {}) => {
  const params = new URLSearchParams();
  const routeIntent = { ...(intent || {}) };
  if (routeIntent.return_target?.page) {
    routeIntent.return_page = routeIntent.return_target.page;
    routeIntent.return_focus = routeIntent.return_target.focus;
    routeIntent.return_customer_id = routeIntent.return_target.customer_id;
  }
  Object.entries(routeIntent).forEach(([key, value]) => {
    if (key === "page" || key === "label" || !/^[a-z][a-z0-9_]*$/i.test(key)) return;
    if (["string", "number", "boolean"].includes(typeof value) && String(value).length <= 120) {
      params.set(key, String(value));
    }
  });
  const hash = `#/${encodeURIComponent(page)}${params.size ? `?${params.toString()}` : ""}`;
  if (window.location.hash === hash) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${window.location.search}${hash}`);
};

const routeForUser = (nextUser) => {
  const requestedRoute = readAppRoute();
  if (requestedRoute && access[requestedRoute.page]?.includes(nextUser.role)) return requestedRoute;
  return { page: defaultPageForRole(nextUser.role), intent: null };
};

const publicSurface = () => {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (hostname.startsWith("status.") || pathname === "/status" || pathname.startsWith("/status/")) return "status";
  if (hostname.startsWith("docs.") || pathname === "/docs" || pathname.startsWith("/docs/")) return "docs";
  return "";
};

function App() {
  const [user, setUser] = useState(null);
  const [accessContexts, setAccessContexts] = useState([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => readAppRoute()?.page || "dashboard");
  const [navigationIntent, setNavigationIntent] = useState(() => readAppRoute()?.intent || null);
  const [appName, setAppName] = useState("Water Billing");
  const [businessSettings, setBusinessSettings] = useState({});
  const [sessionMessage, setSessionMessage] = useState("");
  const [futureDateOverride, setFutureDateOverride] = useState(null);
  const [switchingContext, setSwitchingContext] = useState(false);
  const [contextSwitchError, setContextSwitchError] = useState("");
  const surface = publicSurface();
  const isPasswordReset = new URLSearchParams(window.location.search).has("reset_token");

  const allowedPages = useMemo(() => {
    if (!user) return [];
    return Object.entries(access)
      .filter(([, roles]) => roles.includes(user.role))
      .map(([page]) => page);
  }, [user]);

  useEffect(() => {
    if (user && !allowedPages.includes(currentPage)) {
      const fallbackPage = defaultPageForRole(user.role);
      setNavigationIntent(null);
      setCurrentPage(fallbackPage);
      writeAppRoute(fallbackPage, null, { replace: true });
    }
  }, [allowedPages, currentPage, user]);

  useEffect(() => {
    if (!user) return undefined;
    const restoreRoute = () => {
      const route = routeForUser(user);
      setCurrentPage(route.page);
      setNavigationIntent(route.intent);
    };
    restoreRoute();
    window.addEventListener("popstate", restoreRoute);
    window.addEventListener("hashchange", restoreRoute);
    return () => {
      window.removeEventListener("popstate", restoreRoute);
      window.removeEventListener("hashchange", restoreRoute);
    };
  }, [user]);

  useEffect(() => {
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");

    if (surface || isPasswordReset) {
      setAuthChecked(true);
      return undefined;
    }

    let cancelled = false;
    api
      .me()
      .then(({ user: nextUser, contexts }) => {
        if (cancelled || !nextUser) return;
        const route = routeForUser(nextUser);
        setUser(nextUser);
        setAccessContexts(Array.isArray(contexts) ? contexts : []);
        setNavigationIntent(route.intent);
        setCurrentPage(route.page);
        writeAppRoute(route.page, route.intent, { replace: true });
      })
      .catch(() => {
        clearSessionState();
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isPasswordReset, surface]);

  useEffect(() => {
    api.businessSettings
      .public()
      .then((settings) => {
        setBusinessSettings(settings || {});
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

  useEffect(() => {
    if (!user) return undefined;
    const report = (event) => {
      const error = event.error || event.reason || {};
      api.monitoring
        .reportClientEvent({
          message: error.message || event.message || "Client runtime error",
          stack: error.stack || "",
          url: window.location.href,
          user_agent: navigator.userAgent
        })
        .catch(() => {});
    };
    window.addEventListener("error", report);
    window.addEventListener("unhandledrejection", report);
    return () => {
      window.removeEventListener("error", report);
      window.removeEventListener("unhandledrejection", report);
    };
  }, [user]);

  const handleLogin = async ({ user: nextUser, contexts }) => {
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");
    setSessionMessage("");
    setContextSwitchError("");
    const route = routeForUser(nextUser);
    setUser(nextUser);
    setNavigationIntent(route.intent);
    setCurrentPage(route.page);
    writeAppRoute(route.page, route.intent, { replace: true });
    if (Array.isArray(contexts)) {
      setAccessContexts(contexts);
      return;
    }
    try {
      const contextData = await api.contexts();
      setAccessContexts(Array.isArray(contextData.contexts) ? contextData.contexts : []);
    } catch (_error) {
      setAccessContexts([]);
    }
  };

  const handleNavigate = (target) => {
    if (typeof target === "string") {
      setNavigationIntent(null);
      setCurrentPage(target);
      writeAppRoute(target);
      return;
    }
    if (!target?.page) return;
    setNavigationIntent(target);
    setCurrentPage(target.page);
    writeAppRoute(target.page, target);
  };

  const clearNavigationIntent = () => {
    setNavigationIntent(null);
    writeAppRoute(currentPage, null, { replace: true });
  };

  const handleSwitchContext = async (accessProfileId) => {
    if (!accessProfileId || Number(accessProfileId) === Number(user?.access_profile_id)) return;

    setSwitchingContext(true);
    setContextSwitchError("");
    try {
      const data = await api.switchContext(accessProfileId);
      setUser(data.user);
      setAccessContexts(Array.isArray(data.contexts) ? data.contexts : accessContexts);
      setNavigationIntent(null);
      const nextPage = defaultPageForRole(data.user.role);
      setCurrentPage(nextPage);
      writeAppRoute(nextPage, null, { replace: true });
    } catch (error) {
      setContextSwitchError(error.message || "Unable to switch workspace.");
    } finally {
      setSwitchingContext(false);
    }
  };

  const handleLogout = async (message = "") => {
    await api.logout().catch(() => {});
    clearSessionState();
    localStorage.removeItem("agua_token");
    localStorage.removeItem("agua_user");
    setSessionMessage(typeof message === "string" ? message : "");
    setUser(null);
    setAccessContexts([]);
    setContextSwitchError("");
    setCurrentPage("dashboard");
    setNavigationIntent(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  };

  const handlePasswordChanged = (nextUser) => {
    const route = routeForUser(nextUser);
    setUser(nextUser);
    setNavigationIntent(route.intent);
    setCurrentPage(route.page);
    writeAppRoute(route.page, route.intent, { replace: true });
  };

  if (surface === "status") {
    return <PublicStatusPage appName={appName} />;
  }
  if (surface === "docs") {
    return <PublicDocsPage appName={appName} />;
  }

  if (!authChecked) {
    return (
      <main className="session-loading-screen">
        <BrandLoader label="Checking your session" />
      </main>
    );
  }

  if (!user) {
    return <LandingPage appName={appName} businessSettings={businessSettings} onLogin={handleLogin} sessionMessage={sessionMessage} />;
  }

  if (user.must_change_password) {
    return <PasswordChangePage user={user} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  const pages = {
    portal: <PortalPage user={user} view="overview" />,
    dashboard: <DashboardPage user={user} onNavigate={handleNavigate} />,
    customers: <CustomersPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    readings: <ReadingsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    bills: user.role === "customer" ? <PortalPage user={user} view="bills" /> : <BillsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    receipts: <PortalPage user={user} view="receipts" />,
    requests: <PortalPage user={user} view="requests" />,
    billing: <BillingSetupPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    business: <BusinessSettingsPage user={user} />,
    communications: <CommunicationsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    collections: <CollectionsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    audit: <AuditTrailPage user={user} />,
    payments: <PaymentsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    expenses: <ExpensesPage user={user} />,
    contractors: <ContractorInvoicesPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    payroll: <PayrollPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    maintenance: <MaintenancePage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    production: <ProductionPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} />,
    reports: <ReportsPage user={user} navigationIntent={navigationIntent} onClearNavigationIntent={clearNavigationIntent} onNavigate={handleNavigate} />,
    knowledge: <KnowledgeBasePage user={user} />,
    rates: <RatesPage user={user} />,
    zones: <ZonesPage user={user} />,
    users: <UsersPage user={user} />
  };

  return (
    <ToastProvider>
      <Layout
        appName={appName}
        user={user}
        accessContexts={accessContexts}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onSwitchContext={handleSwitchContext}
        switchingContext={switchingContext}
        contextSwitchError={contextSwitchError}
        onLogout={handleLogout}
      >
        <AppErrorBoundary key={`${user.access_profile_id || "legacy"}:${currentPage}`}>
          <Suspense
            fallback={<div className="page-loading-surface"><BrandLoader label="Loading page" /></div>}
          >
            {pages[currentPage] || pages.dashboard}
          </Suspense>
        </AppErrorBoundary>
        {futureDateOverride ? (
          <ReviewDialog
            open
            eyebrow="Admin override"
            title="Future-dated record"
            description={futureDateOverride.message}
            confirmLabel="Continue"
            reasonLabel="Override reason"
            reasonPlaceholder="Explain why this future-dated record is valid."
            onCancel={() => closeFutureDateOverride("")}
            onConfirm={closeFutureDateOverride}
          />
        ) : null}
      </Layout>
    </ToastProvider>
  );
}

export default App;
