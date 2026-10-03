import {
  BarChart3,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Building2,
  ClipboardList,
  ChevronRight,
  Droplets,
  FileText,
  FileSpreadsheet,
  Gauge,
  History,
  LifeBuoy,
  LogOut,
  MapPinned,
  MessageSquare,
  MonitorSmartphone,
  PlugZap,
  Receipt,
  Settings2,
  Tags,
  Users,
  UserRoundCog,
  WalletCards,
  Wrench
} from "lucide-react";
import { useEffect } from "react";
import GlobalCommandPalette from "./GlobalCommandPalette";

export const navItems = [
  { key: "portal", label: "Portal", icon: MonitorSmartphone, group: "Self Service", workspace: "portal", roles: ["customer"] },
  { key: "bills", label: "Bills", icon: FileText, group: "Billing Cycle", workspace: "billing-cycle", roles: ["admin", "accountant", "customer"] },
  { key: "receipts", label: "Receipts", icon: Receipt, group: "Self Service", workspace: "portal", roles: ["customer"] },
  { key: "requests", label: "Requests", icon: LifeBuoy, group: "Self Service", workspace: "portal", roles: ["customer"] },
  { key: "dashboard", label: "Today", icon: BarChart3, group: "Today", workspace: "today", roles: ["admin", "meter_reader", "accountant", "business_viewer"] },
  { key: "customers", label: "Customers", icon: Users, group: "Customers", workspace: "customers", roles: ["admin", "meter_reader", "accountant"] },
  { key: "readings", label: "Readings & Meters", icon: Gauge, group: "Billing Cycle", workspace: "billing-cycle", roles: ["admin", "meter_reader", "accountant"] },
  { key: "billing", label: "Billing Setup", icon: Settings2, group: "Billing Cycle", workspace: "billing-cycle", roles: ["admin", "accountant"] },
  { key: "payments", label: "Payments & Receipts", icon: WalletCards, group: "Collections", workspace: "collections", roles: ["admin", "accountant"] },
  { key: "collections", label: "Collections", icon: ClipboardList, group: "Collections", workspace: "collections", roles: ["admin", "accountant"] },
  { key: "communications", label: "Communications", icon: MessageSquare, group: "Collections", workspace: "collections", roles: ["admin", "accountant"] },
  { key: "maintenance", label: "Maintenance", icon: Wrench, group: "Field Ops", workspace: "field", roles: ["admin", "accountant", "meter_reader"] },
  { key: "production", label: "Production", icon: PlugZap, group: "Field Ops", workspace: "field", roles: ["admin", "accountant", "meter_reader", "business_viewer"] },
  { key: "expenses", label: "Expenses", icon: Banknote, group: "Finance", workspace: "finance", roles: ["admin", "accountant", "business_viewer"] },
  { key: "contractors", label: "Contractor Invoices", icon: ClipboardList, group: "Finance", workspace: "finance", roles: ["admin", "accountant", "business_viewer"] },
  { key: "payroll", label: "Payroll", icon: UserRoundCog, group: "Finance", workspace: "finance", roles: ["admin", "accountant"] },
  { key: "reports", label: "Reports", icon: FileSpreadsheet, group: "Finance", workspace: "finance", roles: ["admin", "accountant", "business_viewer"] },
  { key: "audit", label: "Audit Trail", icon: History, group: "Admin", workspace: "admin", roles: ["admin", "accountant", "business_viewer"] },
  { key: "knowledge", label: "Knowledge Base", icon: BookOpen, group: "Admin", workspace: "admin", roles: ["admin", "accountant", "meter_reader", "business_viewer"] },
  { key: "business", label: "Business Settings", icon: Building2, group: "Admin", workspace: "admin", roles: ["admin", "accountant", "business_viewer"] },
  { key: "rates", label: "Rates", icon: Tags, group: "Admin", workspace: "admin", roles: ["admin", "accountant"] },
  { key: "zones", label: "Zones", icon: MapPinned, group: "Admin", workspace: "admin", roles: ["admin", "accountant"] },
  { key: "users", label: "Users", icon: UserRoundCog, group: "Admin", workspace: "admin", roles: ["admin"] }
];

export const pageAccess = Object.fromEntries(navItems.map((item) => [item.key, item.roles]));

export const quickActions = [
  { key: "new-customer", label: "New Customer", page: "customers", icon: Users, roles: ["admin", "accountant"] },
  { key: "record-reading", label: "Record Reading", page: "readings", icon: Gauge, roles: ["admin", "accountant", "meter_reader"] },
  { key: "post-payment", label: "Post Payment", page: "payments", icon: WalletCards, roles: ["admin", "accountant"] },
  { key: "send-alerts", label: "Send Alerts", page: "communications", icon: MessageSquare, roles: ["admin", "accountant"] },
  { key: "service-request", label: "New Request", page: "requests", icon: LifeBuoy, roles: ["customer"] },
  { key: "view-reports", label: "Reports", page: "reports", icon: FileSpreadsheet, roles: ["admin", "accountant", "business_viewer"] }
];

const workspaceDefinitions = [
  { key: "portal", label: "My account", icon: MonitorSmartphone },
  { key: "today", label: "Today", icon: BarChart3 },
  { key: "customers", label: "Customers", icon: Users },
  { key: "billing-cycle", label: "Billing Cycle", icon: Gauge },
  { key: "collections", label: "Collections", icon: WalletCards },
  { key: "field", label: "Field Ops", icon: Wrench },
  { key: "finance", label: "Finance", icon: Banknote },
  { key: "admin", label: "Admin", icon: Settings2 }
];

const contextLabel = (context) => {
  const label = context.label || String(context.role || "").replace(/_/g, " ");
  if (!context.customer_acc_number) return label;
  return `${label}: ${context.customer_acc_number}${context.customer_name ? ` - ${context.customer_name}` : ""}`;
};

function Layout({
  appName,
  user,
  accessContexts = [],
  currentPage,
  onNavigate,
  onSwitchContext,
  switchingContext = false,
  contextSwitchError = "",
  onLogout,
  children
}) {
  useEffect(() => {
    const popupSelector = ".workspace-action-menu[open], .ops-mobile-context-switcher[open], .collection-brief-more[open], .table-row-more[open]";
    const closeOpenPopups = (event) => {
      document.querySelectorAll(popupSelector).forEach((popup) => {
        if (!popup.contains(event.target)) popup.removeAttribute("open");
      });
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") document.querySelectorAll(popupSelector).forEach((popup) => popup.removeAttribute("open"));
    };

    document.addEventListener("pointerdown", closeOpenPopups);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOpenPopups);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));
  const visibleQuickActions = quickActions.filter((action) => action.roles.includes(user.role));
  const canSwitchContext = accessContexts.length > 1;
  const currentItem = visibleItems.find((item) => item.key === currentPage);
  const currentWorkspaceKey = user.role === "customer" ? "portal" : currentItem?.workspace || "today";
  const currentWorkspace = workspaceDefinitions.find((workspace) => workspace.key === currentWorkspaceKey) || workspaceDefinitions[1];
  const visibleWorkspaces = workspaceDefinitions.filter((workspace) =>
    visibleItems.some((item) => (user.role === "customer" ? workspace.key === "portal" : item.workspace === workspace.key))
  );
  const workspaceItems = visibleItems.filter((item) =>
    user.role === "customer" ? ["portal", "bills", "receipts", "requests"].includes(item.key) : item.workspace === currentWorkspaceKey
  );
  const navigateWorkspace = (workspace) => {
    const firstItem = visibleItems.find((item) => {
      if (user.role === "customer") return item.workspace === "portal";
      // Staff begin the billing workspace at the active reading workflow; bills remain
      // directly available in the workspace tabs and as the customer portal default.
      return item.workspace === workspace.key && !(workspace.key === "billing-cycle" && item.key === "bills");
    });
    if (firstItem) onNavigate(firstItem.key);
  };

  return (
    <div className="ops-shell">
      <aside className="ops-rail">
        <button className="ops-rail-brand" type="button" onClick={() => onNavigate("dashboard")} aria-label="Open Today" title={appName}>
          <Droplets size={21} />
        </button>
        <nav className="ops-rail-nav" aria-label="Main navigation">
          {visibleWorkspaces.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <button
                key={workspace.key}
                className={currentWorkspaceKey === workspace.key ? "ops-rail-item active" : "ops-rail-item"}
                onClick={() => navigateWorkspace(workspace)}
                type="button"
                title={workspace.label}
                aria-label={`Open ${workspace.label}`}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-context">
            <strong>{currentWorkspace.label}</strong>
            <small>{currentItem?.label || "Workspace"} <ChevronRight size={11} aria-hidden="true" /> {user.access_profile_label || user.role.replace("_", " ")}</small>
          </div>
          <div className="ops-command">
            <GlobalCommandPalette user={user} navItems={visibleItems} quickActions={visibleQuickActions} onNavigate={onNavigate} />
          </div>
          <div className="ops-topbar-actions" aria-label="Quick actions">
            {visibleQuickActions.slice(0, 4).map((action) => {
              const Icon = action.icon;
              return <button key={action.key} type="button" onClick={() => onNavigate(action.page)} title={action.label} aria-label={action.label}><Icon size={17} /></button>;
            })}
            {canSwitchContext ? (
              <>
                <select
                  className="ops-context-switcher"
                  aria-label="Switch workspace"
                  value={String(user.access_profile_id || "")}
                  onChange={(event) => onSwitchContext(event.target.value)}
                  disabled={switchingContext}
                >
                  {accessContexts.map((context) => <option key={context.id} value={context.id}>{contextLabel(context)}</option>)}
                </select>
                <details className="ops-mobile-context-switcher">
                  <summary aria-label="Switch workspace" title="Switch workspace"><ArrowLeftRight size={16} /></summary>
                  <div>
                    {accessContexts.map((context) => (
                      <button
                        className={String(context.id) === String(user.access_profile_id || "") ? "active" : ""}
                        disabled={switchingContext || String(context.id) === String(user.access_profile_id || "")}
                        key={context.id}
                        onClick={() => onSwitchContext(context.id)}
                        type="button"
                      >
                        {contextLabel(context)}
                      </button>
                    ))}
                  </div>
                </details>
              </>
            ) : null}
            <button className="ops-user-button" type="button" title={`${user.name} - Log out`} aria-label="Log out" onClick={() => onLogout()}>
              <span>{String(user.name || "U").trim().charAt(0).toUpperCase()}</span>
              <LogOut size={15} />
            </button>
          </div>
          {contextSwitchError ? <small className="ops-context-error" role="alert">{contextSwitchError}</small> : null}
        </header>
        {workspaceItems.length > 1 ? (
          <nav className="ops-workspace-tabs" aria-label={`${currentWorkspace.label} navigation`}>
            {workspaceItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  className={currentPage === item.key ? "active" : ""}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  aria-current={currentPage === item.key ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="ops-content">{children}</div>
      </main>
    </div>
  );
}

export default Layout;
