import { ArrowRight, FileText, Gauge, Receipt, Search, Users, WalletCards, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const resultText = (item) => normalize([item.label, item.detail, item.type].filter(Boolean).join(" "));

const canUse = (user, roles) => roles.includes(user?.role);

function GlobalCommandPalette({ user, navItems = [], quickActions = [], onNavigate }) {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState([]);
  const [meterRecords, setMeterRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meterLoading, setMeterLoading] = useState(false);
  const [error, setError] = useState("");
  const loadedScope = useRef("");
  const inputRef = useRef(null);
  const visiblePages = useMemo(() => new Set(navItems.map((item) => item.key)), [navItems]);

  const staticResults = useMemo(() => {
    const pages = navItems.map((item) => ({
      key: `page:${item.key}`,
      type: item.group || "Page",
      label: item.label,
      detail: "Open workspace",
      icon: item.icon,
      target: item.key
    }));

    const actions = quickActions.map((action) => ({
      key: `action:${action.key}`,
      type: "Action",
      label: action.label,
      detail: "Start common workflow",
      icon: action.icon,
      target: action.page
    }));

    return [...actions, ...pages];
  }, [navItems, quickActions]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setOpen(false);
        setShortcutsOpen(true);
        return;
      }
      if (!isTyping && (event.metaKey || event.ctrlKey)) {
        const actionKeyByShortcut = { n: "new-customer", r: "record-reading", p: "post-payment" };
        const action = quickActions.find((item) => item.key === actionKeyByShortcut[event.key.toLowerCase()]);
        if (action) {
          event.preventDefault();
          setOpen(false);
          setShortcutsOpen(false);
          onNavigate(action.page);
          return;
        }
      }
      if (event.key === "Escape" && (open || shortcutsOpen)) {
        event.preventDefault();
        setOpen(false);
        setShortcutsOpen(false);
        setQuery("");
      }
      if (event.key === "/" && !isTyping && !open) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, shortcutsOpen, quickActions, onNavigate]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return undefined;
    const scope = `${user.id || "anonymous"}:${user.role}:${user.access_profile_id || "legacy"}`;
    if (loadedScope.current === scope) return undefined;

    let cancelled = false;
    setLoading(true);
    setError("");

    const loaders = [];
    if (visiblePages.has("customers") && canUse(user, ["admin", "accountant", "meter_reader"])) {
      loaders.push(
        api.customers
          .list()
          .then((rows) =>
            rows.slice(0, 200).map((customer) => ({
              key: `customer:${customer.id}`,
              type: "Customer",
              label: `${customer.acc_number || "Account"} - ${customer.name}`,
              detail: [customer.phone, customer.zone_name || customer.location, customer.status].filter(Boolean).join(" | "),
              icon: Users,
              target: "customers",
              navigationTarget: { page: "customers", focus: "customer_360", customer_id: customer.id }
            }))
          )
      );
    }
    if (visiblePages.has("bills") && canUse(user, ["admin", "accountant", "business_viewer"])) {
      loaders.push(
        api.bills
          .list()
          .then((rows) =>
            rows.slice(0, 200).map((bill) => ({
              key: `bill:${bill.id}`,
              type: "Bill",
              label: bill.bill_number || `Bill ${bill.id}`,
              detail: `${bill.customer_name || "-"} | ${bill.acc_number || "-"} | ${money(
                bill.balance_amount ?? Number(bill.total_amount || bill.amount || 0) - Number(bill.paid_amount || 0)
              )} due`,
              icon: FileText,
              target: "bills",
              navigationTarget: { page: "bills", focus: "bill_detail", bill_id: bill.id }
            }))
          )
      );
    }
    if (visiblePages.has("payments") && canUse(user, ["admin", "accountant", "business_viewer"])) {
      loaders.push(
        api.payments
          .list()
          .then((rows) =>
            rows.slice(0, 200).map((payment) => ({
              key: `payment:${payment.id}`,
              type: "Receipt",
              label: payment.receipt_number || `Receipt ${payment.id}`,
              detail: `${payment.customer_name || "-"} | ${payment.acc_number || "-"} | ${money(payment.amount)}`,
              icon: Receipt,
              target: "payments",
              navigationTarget: { page: "payments", focus: "receipt_detail", payment_id: payment.id }
            }))
          )
      );
    }
    if (visiblePages.has("readings") && canUse(user, ["admin", "accountant", "meter_reader"])) {
      loaders.push(
        api.readings
          .eligibleCustomers()
          .then((data) =>
            (data.rows || []).slice(0, 100).map((customer) => ({
              key: `reading:${customer.id}`,
              type: "Meter reading",
              label: `${customer.meter_number || customer.acc_number || "Account"} - ${customer.name}`,
              detail: `${customer.acc_number || "Account"} | Eligible for current reading period`,
              icon: Gauge,
              target: "readings",
              navigationTarget: { page: "readings", focus: "capture_reading", customer_id: customer.id }
            }))
          )
      );
    }
    if (visiblePages.has("maintenance") && canUse(user, ["admin", "accountant", "meter_reader"])) {
      loaders.push(
        api.maintenance
          .list()
          .then((rows) =>
            rows
              .filter((request) => ["open", "in_progress"].includes(request.status))
              .slice(0, 200)
              .map((request) => ({
                key: `task:${request.id}`,
                type: "Field task",
                label: request.request_number || request.title || `Service request ${request.id}`,
                detail: [request.customer_name || request.zone_name, request.category?.replaceAll("_", " "), request.priority, request.status?.replaceAll("_", " ")]
                  .filter(Boolean)
                  .join(" | "),
                icon: Wrench,
                target: "maintenance",
                navigationTarget: { page: "maintenance", focus: "maintenance_request", request_id: request.id }
              }))
          )
      );
    }

    Promise.allSettled(loaders)
      .then((results) => {
        if (cancelled) return;
        const loadedRecords = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
        setRecords(loadedRecords);
        loadedScope.current = scope;
        if (results.some((result) => result.status === "rejected")) {
          setError("Some records could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, user, visiblePages]);

  useEffect(() => {
    const normalizedQuery = normalize(query);
    const canSearchMeters = visiblePages.has("readings") && canUse(user, ["admin", "accountant", "meter_reader"]);
    if (!open || !canSearchMeters || normalizedQuery.length < 2) {
      setMeterRecords([]);
      return undefined;
    }

    let cancelled = false;
    setMeterLoading(true);
    api.meters
      .search(query)
      .then((rows) => {
        if (cancelled) return;
        setMeterRecords(
          rows.map((meter) => ({
            key: `meter:${meter.id}`,
            type: "Meter",
            label: meter.meter_number,
            detail: [meter.customer_name, meter.acc_number, meter.status, meter.latest_reading_value === null ? "No reading" : `Latest ${meter.latest_reading_value}`]
              .filter(Boolean)
              .join(" | "),
            icon: Gauge,
            target: "customers",
            navigationTarget: {
              page: "customers",
              focus: "customer_360",
              customer_id: meter.customer_id,
              customer_360_tab: "overview"
            }
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setError("Meter search could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setMeterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, query, user, visiblePages]);

  const results = useMemo(() => {
    const allResults = [...staticResults, ...records, ...meterRecords];
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return allResults.slice(0, 12);
    return allResults.filter((item) => resultText(item).includes(normalizedQuery)).slice(0, 16);
  }, [query, records, staticResults]);

  const selectResult = (result) => {
    setOpen(false);
    setQuery("");
    onNavigate(result.navigationTarget || result.target);
  };

  const submitFirstResult = (event) => {
    event.preventDefault();
    if (results[0]) selectResult(results[0]);
  };

  return (
    <>
      <button className="command-trigger" type="button" aria-label="Search commands and records" title="Search commands and records (Ctrl or Cmd K)" onClick={() => setOpen(true)}>
        <Search size={15} />
        <span>Search</span>
      </button>
      {open ? (
        <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <form className="command-search" onSubmit={submitFirstResult}>
              <Search size={18} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find customer, bill, receipt, meter, task, or action"
                type="search"
              />
              <button type="button" onClick={() => setOpen(false)} title="Close">
                <X size={16} />
              </button>
            </form>
            <div className="command-results">
              {results.map((result) => {
                const Icon = result.icon || WalletCards;
                return (
                  <button key={result.key} type="button" onClick={() => selectResult(result)}>
                    <span className="command-result-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{result.label}</strong>
                      <small>{result.type} | {result.detail}</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                );
              })}
              {!results.length && !loading ? (
                <div className="command-empty">
                  <strong>No matches</strong>
                  <span>Try an account, customer, bill, receipt, meter, or request number.</span>
                </div>
              ) : null}
              {loading || meterLoading ? <p className="command-status">Loading records...</p> : null}
              {error ? <p className="command-status command-error">{error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
      {shortcutsOpen ? (
        <div className="command-backdrop" role="presentation" onMouseDown={() => setShortcutsOpen(false)}>
          <section
            className="command-palette command-shortcuts"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div><p className="eyebrow">Keyboard</p><h3>Shortcuts</h3></div>
              <button className="icon-button" type="button" title="Close shortcuts" onClick={() => setShortcutsOpen(false)}><X size={16} /></button>
            </div>
            <div className="shortcut-list">
              <div><kbd>Ctrl / Cmd</kbd><kbd>K</kbd><span>Search commands and records</span></div>
              {quickActions.some((action) => action.key === "new-customer") ? <div><kbd>Ctrl / Cmd</kbd><kbd>N</kbd><span>Start a new customer</span></div> : null}
              {quickActions.some((action) => action.key === "record-reading") ? <div><kbd>Ctrl / Cmd</kbd><kbd>R</kbd><span>Record a meter reading</span></div> : null}
              {quickActions.some((action) => action.key === "post-payment") ? <div><kbd>Ctrl / Cmd</kbd><kbd>P</kbd><span>Post a payment</span></div> : null}
              <div><kbd>Ctrl / Cmd</kbd><kbd>/</kbd><span>Show this reference</span></div>
              <div className="shortcut-list-single"><kbd>/</kbd><span>Open search when not typing</span></div>
              <div className="shortcut-list-single"><kbd>Esc</kbd><span>Close search or a shortcut reference</span></div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default GlobalCommandPalette;
