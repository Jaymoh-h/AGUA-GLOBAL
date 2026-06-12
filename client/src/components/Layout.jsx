import {
  BarChart3,
  Banknote,
  BookOpen,
  Building2,
  ClipboardList,
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

export const navItems = [
  { key: "portal", label: "Portal", icon: MonitorSmartphone, roles: ["customer"] },
  { key: "dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin", "meter_reader", "accountant", "business_viewer"] },
  { key: "customers", label: "Customers", icon: Users, roles: ["admin", "meter_reader", "accountant"] },
  { key: "readings", label: "Readings", icon: Gauge, roles: ["admin", "meter_reader", "accountant"] },
  { key: "bills", label: "Bills", icon: FileText, roles: ["admin", "accountant", "customer"] },
  { key: "receipts", label: "Receipts", icon: Receipt, roles: ["customer"] },
  { key: "requests", label: "Requests", icon: LifeBuoy, roles: ["customer"] },
  { key: "billing", label: "Billing Setup", icon: Settings2, roles: ["admin", "accountant"] },
  { key: "business", label: "Business Settings", icon: Building2, roles: ["admin", "accountant", "business_viewer"] },
  { key: "communications", label: "Communications", icon: MessageSquare, roles: ["admin", "accountant"] },
  { key: "payments", label: "Payments", icon: WalletCards, roles: ["admin", "accountant"] },
  { key: "expenses", label: "Expenses", icon: Banknote, roles: ["admin", "accountant"] },
  { key: "contractors", label: "Contractor Invoices", icon: ClipboardList, roles: ["admin", "accountant"] },
  { key: "payroll", label: "Payroll", icon: UserRoundCog, roles: ["admin", "accountant"] },
  { key: "maintenance", label: "Maintenance", icon: Wrench, roles: ["admin", "accountant", "meter_reader"] },
  { key: "production", label: "Production", icon: PlugZap, roles: ["admin", "accountant", "meter_reader", "business_viewer"] },
  { key: "reports", label: "Reports", icon: FileSpreadsheet, roles: ["admin", "accountant", "business_viewer"] },
  { key: "knowledge", label: "Knowledge Base", icon: BookOpen, roles: ["admin", "accountant", "meter_reader", "business_viewer"] },
  { key: "audit", label: "Audit Trail", icon: History, roles: ["admin", "accountant", "business_viewer"] },
  { key: "rates", label: "Rates", icon: Tags, roles: ["admin", "accountant"] },
  { key: "zones", label: "Zones", icon: MapPinned, roles: ["admin", "accountant"] },
  { key: "users", label: "Users", icon: Receipt, roles: ["admin"] }
];

export const pageAccess = Object.fromEntries(navItems.map((item) => [item.key, item.roles]));

function Layout({ appName, user, currentPage, onNavigate, onLogout, children }) {
  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Droplets size={22} />
          </span>
          <div>
            <strong>{appName}</strong>
            <small>Water Billing</small>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={currentPage === item.key ? "nav-item active" : "nav-item"}
                onClick={() => onNavigate(item.key)}
                type="button"
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div>
            <strong>{user.name}</strong>
            <small>{user.access_profile_label || user.role.replace("_", " ")}</small>
          </div>
          <button className="icon-button" onClick={() => onLogout()} type="button" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

export default Layout;
