import {
  BarChart3,
  Droplets,
  FileText,
  Gauge,
  LogOut,
  MapPinned,
  Receipt,
  Tags,
  Users,
  WalletCards
} from "lucide-react";

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin", "meter_reader", "accountant", "customer"] },
  { key: "customers", label: "Customers", icon: Users, roles: ["admin", "meter_reader", "accountant", "customer"] },
  { key: "readings", label: "Readings", icon: Gauge, roles: ["admin", "meter_reader"] },
  { key: "bills", label: "Bills", icon: FileText, roles: ["admin", "accountant", "customer"] },
  { key: "payments", label: "Payments", icon: WalletCards, roles: ["admin", "accountant"] },
  { key: "rates", label: "Rates", icon: Tags, roles: ["admin", "accountant"] },
  { key: "zones", label: "Zones", icon: MapPinned, roles: ["admin", "accountant"] },
  { key: "users", label: "Users", icon: Receipt, roles: ["admin"] }
];

function Layout({ user, currentPage, onNavigate, onLogout, children }) {
  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Droplets size={22} />
          </span>
          <div>
            <strong>AGUA Global</strong>
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
            <small>{user.role.replace("_", " ")}</small>
          </div>
          <button className="icon-button" onClick={onLogout} type="button" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

export default Layout;
