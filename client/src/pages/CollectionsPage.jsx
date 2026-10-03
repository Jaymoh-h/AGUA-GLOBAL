import { ArrowUpRight, Clock3, Eye, Mail, MoreHorizontal, ReceiptText, Scale, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CollectionsRecoveryQueue from "../components/CollectionsRecoveryQueue";
import EmptyState from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import useScopedDraft from "../utils/useScopedDraft";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const label = (value) => String(value || "-").replaceAll("_", " ");
const today = () => new Date().toISOString().slice(0, 10);
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "No reminder sent");
const emptyArrangement = (customerId = "", amount = "", request = null) => {
  const proposal = request?.request_metadata?.payment_plan_proposal || {};
  return {
    customer_id: customerId,
    maintenance_request_id: request?.id ? String(request.id) : "",
    agreed_amount: amount,
    installment_amount: proposal.installment_amount ? String(proposal.installment_amount) : "",
    frequency: ["weekly", "monthly"].includes(proposal.frequency) ? proposal.frequency : "monthly",
    first_due_date: proposal.preferred_first_due_date || "",
    notes: ""
  };
};
const emptyStandingOrder = (customerId = "") => ({
  customer_id: customerId,
  mandate_reference: "",
  expected_amount: "",
  frequency: "monthly",
  first_due_date: "",
  notes: ""
});

const readyChannels = (row) => ["email", "sms", "whatsapp"].filter((medium) => row.contacts?.[medium]?.ready);
const paymentPlanProposalSummary = (request) => {
  const proposal = request?.request_metadata?.payment_plan_proposal;
  if (!proposal?.installment_amount || !proposal?.frequency || !proposal?.preferred_first_due_date) {
    return "No customer terms supplied";
  }
  return `${money(proposal.installment_amount)} ${proposal.frequency} from ${proposal.preferred_first_due_date}`;
};

function CollectionsPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const pageSize = 100;
  const [queue, setQueue] = useState({ rows: [], summary: {}, total: 0 });
  const [deliveryPayload, setDeliveryPayload] = useState({ summary: {}, rows: [] });
  const [suspenseItems, setSuspenseItems] = useState([]);
  const [financeCases, setFinanceCases] = useState([]);
  const [arrangements, setArrangements] = useState([]);
  const [standingOrders, setStandingOrders] = useState([]);
  const [arrangementForm, setArrangementForm] = useState(emptyArrangement);
  const [showArrangementForm, setShowArrangementForm] = useState(false);
  const [arrangementReview, setArrangementReview] = useState(null);
  const [closingArrangement, setClosingArrangement] = useState(null);
  const [closingDraft, setClosingDraft] = useState({ status: "completed", closure_notes: "" });
  const [arrangementClosureReview, setArrangementClosureReview] = useState(null);
  const [savingArrangement, setSavingArrangement] = useState(false);
  const [decliningPaymentPlanRequest, setDecliningPaymentPlanRequest] = useState(null);
  const [standingOrderForm, setStandingOrderForm] = useState(emptyStandingOrder);
  const [showStandingOrderForm, setShowStandingOrderForm] = useState(false);
  const [standingOrderReview, setStandingOrderReview] = useState(null);
  const [standingOrderStatusDraft, setStandingOrderStatusDraft] = useState(null);
  const [standingOrderStatusReview, setStandingOrderStatusReview] = useState(null);
  const [savingStandingOrder, setSavingStandingOrder] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [queueView, setQueueView] = useScopedDraft(
    user,
    "collections-queue-view",
    () => ({ priorityFilter: "all" }),
    { storage: "local" }
  );
  const priorityFilter = queueView.priorityFilter || "all";
  const setPriorityFilter = (value) => setQueueView((current) => ({ ...current, priorityFilter: value }));
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [error, setError] = useState("");
  const accountBriefRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setInitialError("");
    try {
      const [arrearsQueue, requests, arrangementRows, standingOrderRows, deliveryRows, suspenseRows] = await Promise.all([
      api.communications.arrearsFollowUp(pageSize),
      api.maintenance.list(),
      api.paymentArrangements.list(),
      api.standingOrders.list(),
      api.communications.deliveryExceptions({ status: "all", days: 90, limit: 8 }),
      api.payments.suspense()
      ]);
      setQueue(arrearsQueue);
      setArrangements(arrangementRows);
      setStandingOrders(standingOrderRows);
      setDeliveryPayload(deliveryRows);
      setSuspenseItems(suspenseRows);
      setFinanceCases(
        requests.filter(
          (request) => ["billing_dispute", "payment_plan"].includes(request.category) && !["resolved", "cancelled"].includes(request.status)
        )
      );
    } catch (requestError) {
      setInitialError(requestError.message || "The collections work queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setSelectedId((current) => queue.rows.some((row) => row.customer_id === current) ? current : queue.rows[0]?.customer_id || null);
  }, [queue.rows]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError("");
    try {
      const nextPage = await api.communications.arrearsFollowUp(pageSize, queue.rows.length);
      setQueue((current) => ({ ...nextPage, rows: [...current.rows, ...(nextPage.rows || [])] }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const rows = queue.rows || [];
  const focusKey = navigationIntent?.page === "collections" ? navigationIntent.focus : "";
  const priorityRows = priorityFilter === "all"
    ? rows
    : priorityFilter === "contact_gaps"
      ? rows.filter((row) => !row.has_ready_contact)
      : rows.filter((row) => row.priority_tier === priorityFilter);
  const table = useTableControls(priorityRows, {
    storageKey: `collections-arrears:${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`,
    searchFields: ["customer_name", "acc_number", "zone_name", "bill_number", "oldest_due_date"]
  });
  const selected = rows.find((row) => row.customer_id === selectedId) || table.filteredRows[0] || null;
  const selectedArrangement = arrangements.find((arrangement) => arrangement.status === "active" && arrangement.customer_id === selected?.customer_id) || null;
  const selectedStandingOrder = standingOrders.find((order) => order.status === "active" && order.customer_id === selected?.customer_id) || null;
  const selectedPaymentPlanRequests = financeCases
    .filter((request) => request.category === "payment_plan" && request.customer_id === selected?.customer_id)
    .sort((left, right) => String(right.reported_at || "").localeCompare(String(left.reported_at || "")));
  const selectedPaymentPlanRequest =
    selectedPaymentPlanRequests.find((request) => Number(request.id) === Number(arrangementForm.maintenance_request_id)) ||
    selectedPaymentPlanRequests[0] ||
    null;
  const selectedPaymentPlanProposal = selectedPaymentPlanRequest?.request_metadata?.payment_plan_proposal || null;
  const visibleFinanceCases = focusKey === "payment_plan_requests"
    ? financeCases.filter((request) => request.category === "payment_plan")
    : financeCases;
  const financeCaseTable = useTableControls(visibleFinanceCases, {
    storageKey: `collections-finance-cases:${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`,
    searchFields: ["request_number", "customer_name", "acc_number", "category", "priority", "status", "reported_at"]
  });
  useEffect(() => {
    if (focusKey === "contact_gaps") setPriorityFilter("contact_gaps");
  }, [focusKey]);
  if (loading) return <WorkspaceState title="Preparing the collections queue" detail="Retrieving arrears, delivery, suspense, and account-plan controls." />;
  if (initialError) return <WorkspaceState state="error" title="The collections queue could not load" detail={initialError} onRetry={load} />;
  const activePlans = arrangements.filter((arrangement) => arrangement.status === "active");
  const visiblePlans = focusKey === "payment_plans_behind"
    ? activePlans.filter((arrangement) => arrangement.performance_status === "behind")
    : activePlans;
  const activeStandingOrders = standingOrders.filter((order) => order.status === "active");
  const visibleStandingOrders = focusKey === "standing_orders_behind"
    ? activeStandingOrders.filter((order) => order.performance_status === "behind")
    : activeStandingOrders;

  const startArrangement = () => {
    if (!selected) return;
    setClosingArrangement(null);
    setArrangementClosureReview(null);
    setArrangementReview(null);
    setArrangementForm(
      emptyArrangement(selected.customer_id, String(Number(selected.overdue_balance || 0)), selectedPaymentPlanRequests[0] || null)
    );
    setShowArrangementForm(true);
  };

  const reviewPaymentPlanRequest = (request) => {
    const account = rows.find((row) => Number(row.customer_id) === Number(request.customer_id));
    if (!account) {
      setError("This payment-plan request has no overdue balance in the collections queue. Review the account before approving any terms.");
      return;
    }
    const activePlan = arrangements.find(
      (arrangement) => arrangement.status === "active" && Number(arrangement.customer_id) === Number(account.customer_id)
    );
    if (activePlan) {
      setSelectedId(account.customer_id);
      setShowArrangementForm(false);
      setArrangementReview(null);
      setError(`This account already has active payment plan ${activePlan.arrangement_number}. Close or update that plan before reviewing another proposal.`);
      requestAnimationFrame(() => accountBriefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    setError("");
    setSelectedId(account.customer_id);
    setClosingArrangement(null);
    setArrangementClosureReview(null);
    setArrangementReview(null);
    setShowStandingOrderForm(false);
    setArrangementForm(emptyArrangement(account.customer_id, String(Number(account.overdue_balance || 0)), request));
    setShowArrangementForm(true);
    requestAnimationFrame(() => accountBriefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const declinePaymentPlanRequest = async (reason) => {
    if (!decliningPaymentPlanRequest) return;
    setSavingArrangement(true);
    setError("");
    try {
      const declined = await api.paymentArrangements.declineRequest(decliningPaymentPlanRequest.id, reason);
      setFinanceCases((current) => current.filter((request) => Number(request.id) !== Number(declined.id)));
      setDecliningPaymentPlanRequest(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingArrangement(false);
    }
  };

  const setArrangementField = (field, value) => setArrangementForm((current) => ({ ...current, [field]: value }));
  const setStandingOrderField = (field, value) => setStandingOrderForm((current) => ({ ...current, [field]: value }));

  const reviewArrangement = () => {
    if (!selected) return;
    setArrangementReview({
      ...arrangementForm,
      customer_name: selected.customer_name,
      acc_number: selected.acc_number
    });
    setShowArrangementForm(false);
  };

  const submitArrangement = async (approvalNote) => {
    if (!arrangementReview) return;
    setSavingArrangement(true);
    setError("");
    try {
      const created = await api.paymentArrangements.create({ ...arrangementReview, notes: approvalNote });
      setArrangements((current) => [created, ...current]);
      if (created.maintenance_request_id) {
        setFinanceCases((current) => current.filter((request) => Number(request.id) !== Number(created.maintenance_request_id)));
      }
      try {
        setArrangements(await api.paymentArrangements.list());
      } catch (_refreshError) {
        // The approved plan is already saved; a later refresh restores its derived performance fields.
      }
      setShowArrangementForm(false);
      setArrangementReview(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingArrangement(false);
    }
  };

  const reviewArrangementClosure = () => {
    if (!closingArrangement) return;
    setArrangementClosureReview({ arrangement: closingArrangement, ...closingDraft });
    setClosingArrangement(null);
  };

  const submitArrangementClosure = async () => {
    if (!arrangementClosureReview) return;
    setSavingArrangement(true);
    setError("");
    try {
      const updated = await api.paymentArrangements.close(arrangementClosureReview.arrangement.id, {
        status: arrangementClosureReview.status,
        closure_notes: arrangementClosureReview.closure_notes
      });
      setArrangements((current) => current.map((arrangement) => (arrangement.id === updated.id ? updated : arrangement)));
      setClosingArrangement(null);
      setArrangementClosureReview(null);
      setClosingDraft({ status: "completed", closure_notes: "" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingArrangement(false);
    }
  };

  const startStandingOrder = () => {
    if (!selected) return;
    setShowArrangementForm(false);
    setStandingOrderReview(null);
    setStandingOrderStatusDraft(null);
    setStandingOrderStatusReview(null);
    setStandingOrderForm(emptyStandingOrder(String(selected.customer_id)));
    setShowStandingOrderForm(true);
  };

  const reviewStandingOrder = () => {
    if (!selected) return;
    setStandingOrderReview({
      ...standingOrderForm,
      customer_name: selected.customer_name,
      acc_number: selected.acc_number
    });
    setShowStandingOrderForm(false);
  };

  const submitStandingOrder = async (approvalNote) => {
    if (!standingOrderReview) return;
    setSavingStandingOrder(true);
    setError("");
    try {
      const created = await api.standingOrders.create({ ...standingOrderReview, notes: approvalNote });
      setStandingOrders(await api.standingOrders.list());
      setShowStandingOrderForm(false);
      setStandingOrderReview(null);
      setStandingOrderForm(emptyStandingOrder(String(created.customer_id)));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingStandingOrder(false);
    }
  };

  const reviewStandingOrderStatus = () => {
    if (!standingOrderStatusDraft?.order) return;
    setStandingOrderStatusReview({ ...standingOrderStatusDraft });
    setStandingOrderStatusDraft(null);
  };

  const submitStandingOrderStatus = async () => {
    if (!standingOrderStatusReview?.order) return;
    setSavingStandingOrder(true);
    setError("");
    try {
      await api.standingOrders.updateStatus(standingOrderStatusReview.order.id, {
        status: standingOrderStatusReview.status,
        reason: standingOrderStatusReview.reason
      });
      setStandingOrders(await api.standingOrders.list());
      setStandingOrderStatusDraft(null);
      setStandingOrderStatusReview(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingStandingOrder(false);
    }
  };

  return <section className="collections-workbench">
    <header className="collections-header">
      <div><p className="eyebrow">Revenue control</p><h1>Collections workbench</h1><p>Move one account forward at a time, starting with the balances that have waited longest.</p></div>
      <div className="collections-total"><small>Overdue balance</small><strong>{money(queue.summary?.overdue_balance)}</strong><span>{Number(queue.summary?.account_count || 0).toLocaleString()} accounts require follow-up</span></div>
    </header>
    {focusKey === "arrears" ? <FocusNotice title="Overdue receivables" detail="The queue is ordered by time overdue, then outstanding balance." onClear={onClearNavigationIntent} /> : null}
    {focusKey === "contact_gaps" ? <FocusNotice title="Delivery contact gaps" detail="These overdue accounts have no enabled email, SMS, or WhatsApp channel. Repair the account contact before starting collection outreach." onClear={onClearNavigationIntent} /> : null}
    {focusKey === "payment_plans_behind" ? <FocusNotice title="Payment plans behind" detail="Showing active plans where receipts posted after approval are below the instalments due." onClear={onClearNavigationIntent} /> : null}
    {focusKey === "standing_orders_behind" ? <FocusNotice title="Standing orders behind" detail="Showing active bank mandates where confirmed receipts matched by mandate reference are below scheduled amounts." onClear={onClearNavigationIntent} /> : null}
    {focusKey === "payment_plan_requests" ? <FocusNotice title="Payment-plan proposals" detail="Showing customer requests that still need a staff decision. Reviewing a proposal never creates a plan until it is explicitly approved." onClear={onClearNavigationIntent} /> : null}
    {error ? <p className="form-error">{error}</p> : null}

    <div className="collections-kpis" aria-label="Collections snapshot">
      <div><small>Follow-up queue</small><strong>{Number(queue.summary?.account_count || 0).toLocaleString()}</strong><span>Accounts in arrears</span></div>
      <div><small>Critical age</small><strong>{Number(queue.summary?.critical_count || 0).toLocaleString()}</strong><span>Over 90 days overdue</span></div>
      <div><small>Top exposure</small><strong>{money(queue.summary?.top_exposure_balance)}</strong><span>Highest-balance 20% of accounts</span></div>
      <div className={Number(queue.summary?.contact_gap_count || 0) ? "needs-attention" : ""}><small>Contact gaps</small><strong>{Number(queue.summary?.contact_gap_count || 0).toLocaleString()}</strong><span>{money(queue.summary?.contact_gap_balance)} needs contact repair</span></div>
      <div><small>Queue coverage</small><strong>{rows.length.toLocaleString()} / {Number(queue.total || 0).toLocaleString()}</strong><span>Accounts loaded</span></div>
    </div>

    <div className="collections-layout">
      <section className="collections-queue" aria-labelledby="collections-queue-title">
        <div className="collections-section-heading"><div><p className="eyebrow">Follow-up queue</p><h2 id="collections-queue-title">Prioritised accounts</h2></div><span>{table.total.toLocaleString()} visible</span></div>
        <div className="collections-priority-filter" role="group" aria-label="Arrears priority filter">
          {[
            ["all", `All ${Number(queue.summary?.account_count || 0).toLocaleString()}`],
            ["critical", `90+ days ${Number(queue.summary?.critical_count || 0).toLocaleString()}`],
            ["at_risk", `31-90 days ${Number(queue.summary?.at_risk_count || 0).toLocaleString()}`],
            ["early_arrears", `1-30 days ${Number(queue.summary?.early_arrears_count || 0).toLocaleString()}`],
            ["contact_gaps", `Contact gaps ${Number(queue.summary?.contact_gap_count || 0).toLocaleString()}`]
          ].map(([value, name]) => <button key={value} className={priorityFilter === value ? "active" : ""} type="button" onClick={() => setPriorityFilter(value)}>{name}</button>)}
        </div>
        <TableControls table={table} label="accounts" placeholder="Find an account, customer, or zone" />
        <div className="collections-account-list">
          {table.visibleRows.length ? table.visibleRows.map((row) => {
            const channels = readyChannels(row);
            const isSelected = row.customer_id === selected?.customer_id;
            return <button className={isSelected ? "collection-account-row selected" : "collection-account-row"} type="button" key={row.customer_id} onClick={() => setSelectedId(row.customer_id)} aria-pressed={isSelected}>
              <span className="collection-account-risk"><Clock3 size={16} /><strong>{Number(row.days_overdue || 0)}</strong><small>days</small></span>
              <span className="collection-account-copy"><strong>{row.customer_name}</strong><small>{row.acc_number} | {row.zone_name || "Unzoned"}</small><span className="collection-priority-tags"><b className={`priority-${row.priority_tier || "early_arrears"}`}>{label(row.priority_tier)}</b>{row.is_top_exposure ? <b className="priority-exposure">Top exposure</b> : null}{!row.has_ready_contact ? <b className="priority-contact-gap">Contact gap</b> : null}</span><span className="collection-progress"><i style={{ width: `${Math.min(100, Math.max(8, Number(row.days_overdue || 0)))}%` }} /></span></span>
              <span className="collection-account-balance"><strong>{money(row.overdue_balance)}</strong><small>{channels.length ? channels.map((channel) => channel.toUpperCase()).join(" | ") : "No ready channel"}</small></span>
              <ArrowUpRight size={17} />
            </button>;
          }) : <EmptyState title="No overdue accounts match this view" detail="Try a different search, or return when new overdue balances appear." />}
        </div>
        {queue.total > rows.length ? <div className="collections-load-more"><small>Showing {rows.length.toLocaleString()} of {queue.total.toLocaleString()} accounts.</small><button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more"}</button></div> : null}
      </section>

      <aside ref={accountBriefRef} className="collection-account-brief" aria-labelledby="collection-account-title">
        {selected ? <>
          <div className="collection-brief-header"><p className="eyebrow">Account brief</p><span>{selected.bill_number || "No latest bill"}</span></div>
          <h2 id="collection-account-title">{selected.customer_name}</h2>
          <p>{selected.acc_number} | {selected.zone_name || "Unzoned"}</p>
          <div className="collection-balance"><small>Overdue balance</small><strong>{money(selected.overdue_balance)}</strong><span>Oldest due {selected.oldest_due_date?.slice(0, 10) || "-"} | {Number(selected.days_overdue || 0).toLocaleString()} days overdue</span></div>
          <dl className="collection-brief-details"><div><dt>Collection priority</dt><dd>{label(selected.priority_tier)}{selected.is_top_exposure ? " | top exposure" : ""}</dd></div><div><dt>Priority reason</dt><dd>{selected.priority_reason || "Overdue balance"}</dd></div><div><dt>Latest bill</dt><dd>{selected.bill_number || "-"}</dd></div><div><dt>Total outstanding</dt><dd>{money(selected.total_outstanding)}</dd></div><div><dt>Ready channels</dt><dd>{readyChannels(selected).map((channel) => channel.toUpperCase()).join(", ") || "None"}</dd></div></dl>
          <div className="collection-brief-actions">
            <button type="button" onClick={() => onNavigate?.({ page: "payments", focus: "prepare_payment", customer_id: selected.customer_id })}><WalletCards size={16} />Prepare payment</button>
            <button type="button" onClick={() => onNavigate?.({ page: "communications", focus: "overdue_follow_up", customer_id: selected.customer_id })}><Mail size={16} />Prepare reminder</button>
            {selected.priority_tier === "critical" && !selectedArrangement ? <button type="button" onClick={() => onNavigate?.({ page: "communications", focus: "disconnection_warning", customer_id: selected.customer_id })}><Mail size={16} />Prepare warning</button> : null}
            {selectedArrangement?.performance_status === "behind" ? <button type="button" onClick={() => onNavigate?.({ page: "communications", focus: "payment_plan_follow_up", customer_id: selected.customer_id })}><Mail size={16} />Plan reminder</button> : null}
            <details className="collection-brief-more">
              <summary aria-label="More account actions" title="More account actions"><MoreHorizontal size={18} /></summary>
              <div className="collection-brief-more-menu">
                <button type="button" onClick={() => onNavigate?.({ page: "customers", focus: "customer_360", customer_id: selected.customer_id })}><Eye size={16} />{selected.has_ready_contact ? "Open account" : "Fix delivery contact"}</button>
                <button type="button" onClick={() => onNavigate?.({ page: "bills", focus: "overdue_bills" })}><ReceiptText size={16} />Review bills</button>
                {!selectedArrangement ? <button type="button" onClick={startArrangement}><Scale size={16} />Set payment plan</button> : null}
                {!selectedStandingOrder ? <button type="button" onClick={startStandingOrder}><WalletCards size={16} />Set bank mandate</button> : null}
              </div>
            </details>
          </div>
          {selectedArrangement ? (
            <div className="collection-arrangement-summary">
              <div><small>Active payment plan</small><strong>{selectedArrangement.arrangement_number}</strong></div>
              <span>{money(selectedArrangement.installment_amount)} {selectedArrangement.frequency} from {selectedArrangement.first_due_date?.slice(0, 10)}</span>
              {selectedArrangement.request_number ? <span>Linked request: {selectedArrangement.request_number}</span> : null}
              <span className={`plan-performance plan-${selectedArrangement.performance_status}`}>{label(selectedArrangement.performance_status)}{Number(selectedArrangement.shortfall_amount || 0) ? ` | shortfall ${money(selectedArrangement.shortfall_amount)}` : ""}</span>
              <span>{selectedArrangement.last_reminder_status ? `Last reminder: ${label(selectedArrangement.last_reminder_status)} by ${String(selectedArrangement.last_reminder_channel || "-").toUpperCase()} on ${dateTime(selectedArrangement.last_reminder_at)}` : "No payment-plan reminder sent"}</span>
              <button type="button" onClick={() => { setShowArrangementForm(false); setArrangementClosureReview(null); setClosingArrangement(selectedArrangement); }}>Close plan</button>
            </div>
          ) : null}
          {selectedStandingOrder ? (
            <div className="collection-arrangement-summary standing-order-summary">
              <div><small>Active bank mandate</small><strong>{selectedStandingOrder.mandate_reference}</strong></div>
              <span>{money(selectedStandingOrder.expected_amount)} {selectedStandingOrder.frequency} from {selectedStandingOrder.first_due_date?.slice(0, 10)}</span>
              <span className={`plan-performance plan-${selectedStandingOrder.performance_status}`}>{label(selectedStandingOrder.performance_status)}{Number(selectedStandingOrder.shortfall_amount || 0) ? ` | unmatched ${money(selectedStandingOrder.shortfall_amount)}` : ""}</span>
              <span>Confirmed receipts matched: {money(selectedStandingOrder.matched_amount)}</span>
              <button type="button" onClick={() => { setShowStandingOrderForm(false); setStandingOrderStatusReview(null); setStandingOrderStatusDraft({ order: selectedStandingOrder, status: "paused", reason: "" }); }}>Update mandate</button>
            </div>
          ) : null}
        </> : <EmptyState title="Choose an account" detail="Select an account from the queue to see its collection brief." />}
      </aside>
    </div>

    <CollectionsRecoveryQueue deliveryPayload={deliveryPayload} suspenseItems={suspenseItems} onNavigate={onNavigate} />

    <section className="collections-case-queue" aria-labelledby="finance-case-title">
      <div className="collections-section-heading">
        <div>
          <p className="eyebrow">Account care</p>
          <h2 id="finance-case-title">Billing disputes and payment plans</h2>
        </div>
        <span>{financeCaseTable.total.toLocaleString()} open cases</span>
      </div>
      <TableControls table={financeCaseTable} label="finance cases" placeholder="Find an account or case" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Case</th><th>Account</th><th>Type</th><th>Customer proposal</th><th>Priority</th><th>Received</th><th>Actions</th></tr></thead>
          <tbody>
            {financeCaseTable.visibleRows.length ? (
              financeCaseTable.visibleRows.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.request_number || `Request ${request.id}`}</strong>
                    <small>{request.description || request.title}</small>
                  </td>
                  <td>
                    {request.customer_name || "General"}
                    <small>{request.acc_number || request.zone_name || "-"}</small>
                  </td>
                  <td>{label(request.category)}</td>
                  <td>{request.category === "payment_plan" ? <span className="collection-plan-proposal">{paymentPlanProposalSummary(request)}</span> : "-"}</td>
                  <td><span className={`status status-${request.priority}`}>{label(request.priority)}</span></td>
                  <td>{request.reported_at?.slice(0, 10) || "-"}</td>
                  <td>
                    {request.category === "payment_plan" ? (
                      <div className="collection-case-actions">
                        <button type="button" className="secondary-button collection-review-plan" onClick={() => reviewPaymentPlanRequest(request)}>Review plan</button>
                        <button type="button" className="danger-button collection-decline-plan" onClick={() => setDecliningPaymentPlanRequest(request)}>Decline</button>
                      </div>
                    ) : (
                      <button
                        className="icon-button"
                        type="button"
                        title="Review finance case"
                        onClick={() => onNavigate?.({ page: "maintenance", focus: "finance_cases" })}
                      >
                        <Scale size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="muted">No open billing disputes or payment-plan requests.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    <section className="collections-case-queue" aria-labelledby="plan-watchlist-title">
      <div className="collections-section-heading">
        <div>
          <p className="eyebrow">Plan follow-up</p>
          <h2 id="plan-watchlist-title">Active payment-plan watchlist</h2>
        </div>
        <span>{visiblePlans.length.toLocaleString()} {focusKey === "payment_plans_behind" ? "behind plans" : "active plans"}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Plan</th><th>Account</th><th>Next due</th><th>Expected</th><th>Received</th><th>Status</th><th>Last reminder</th><th>Action</th></tr></thead>
          <tbody>
            {visiblePlans.length ? visiblePlans.map((arrangement) => (
              <tr key={arrangement.id}>
                <td><strong>{arrangement.arrangement_number}</strong><small>{money(arrangement.installment_amount)} {arrangement.frequency}</small></td>
                <td>{arrangement.customer_name}<small>{arrangement.acc_number}</small></td>
                <td>{arrangement.next_due_date?.slice(0, 10) || arrangement.first_due_date?.slice(0, 10) || "-"}</td>
                <td>{money(arrangement.expected_amount)}</td>
                <td>{money(arrangement.received_amount)}</td>
                <td><span className={`plan-performance plan-${arrangement.performance_status}`}>{label(arrangement.performance_status)}</span></td>
                <td>{arrangement.last_reminder_status ? <><StatusBadge status={arrangement.last_reminder_status} /><small>{String(arrangement.last_reminder_channel || "-").toUpperCase()} | {dateTime(arrangement.last_reminder_at)}</small></> : <span className="muted">Not sent</span>}</td>
                <td>{arrangement.performance_status === "behind" ? <button className="icon-button" type="button" title="Prepare payment-plan reminder" onClick={() => onNavigate?.({ page: "communications", focus: "payment_plan_follow_up", customer_id: arrangement.customer_id })}><Mail size={16} /></button> : "-"}</td>
              </tr>
            )) : <tr><td colSpan="8" className="muted">No active payment plans.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="collections-case-queue" aria-labelledby="standing-order-watchlist-title">
      <div className="collections-section-heading">
        <div>
          <p className="eyebrow">Bank collection control</p>
          <h2 id="standing-order-watchlist-title">Active standing-order watchlist</h2>
        </div>
        <span>{visibleStandingOrders.length.toLocaleString()} {focusKey === "standing_orders_behind" ? "behind mandates" : "active mandates"}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mandate</th><th>Account</th><th>Next due</th><th>Expected</th><th>Confirmed</th><th>Standing</th><th>Action</th></tr></thead>
          <tbody>
            {visibleStandingOrders.length ? visibleStandingOrders.map((order) => (
              <tr key={order.id}>
                <td><strong>{order.mandate_reference}</strong><small>{money(order.expected_amount)} {order.frequency}</small></td>
                <td>{order.customer_name}<small>{order.acc_number}</small></td>
                <td>{order.next_due_date?.slice(0, 10) || order.first_due_date?.slice(0, 10) || "-"}</td>
                <td>{money(order.expected_to_date)}</td>
                <td>{money(order.matched_amount)}</td>
                <td><span className={`plan-performance plan-${order.performance_status}`}>{label(order.performance_status)}</span></td>
                <td>{order.performance_status === "behind" ? <button className="icon-button" type="button" title="Prepare standing-order reminder" onClick={() => onNavigate?.({ page: "communications", focus: "standing_order_follow_up", customer_id: order.customer_id })}><Mail size={16} /></button> : "-"}</td>
              </tr>
            )) : <tr><td colSpan="7" className="muted">{focusKey === "standing_orders_behind" ? "No active mandates are behind their confirmed receipt schedule." : "No active bank mandates. Register one from an account brief when a customer provides a standing-order reference."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <ReviewDialog
      open={showArrangementForm}
      eyebrow="Payment plan"
      title="Set payment plan"
      description={selected ? `Agree terms for ${selected.customer_name} (${selected.acc_number}) without losing the collections queue.` : ""}
      confirmLabel="Review plan"
      cancelLabel="Cancel"
      reasonLabel={null}
      busy={savingArrangement}
      busyLabel="Reviewing..."
      onCancel={() => !savingArrangement && setShowArrangementForm(false)}
      onConfirm={reviewArrangement}
    >
      <div className="collection-arrangement-form">
        {selectedPaymentPlanProposal ? <p className="form-note wide">Customer proposal: {money(selectedPaymentPlanProposal.installment_amount)} {selectedPaymentPlanProposal.frequency} from {selectedPaymentPlanProposal.preferred_first_due_date}. Review and amend the terms before approval.</p> : null}
        <label>Agreed amount<input type="number" min="0.01" step="0.01" value={arrangementForm.agreed_amount} onChange={(event) => setArrangementField("agreed_amount", event.target.value)} required /></label>
        <label>Instalment amount<input type="number" min="0.01" step="0.01" value={arrangementForm.installment_amount} onChange={(event) => setArrangementField("installment_amount", event.target.value)} required /></label>
        <label>Frequency<select value={arrangementForm.frequency} onChange={(event) => setArrangementField("frequency", event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>First due date<input type="date" min={today()} value={arrangementForm.first_due_date} onChange={(event) => setArrangementField("first_due_date", event.target.value)} required /></label>
        {selectedPaymentPlanRequests.length ? <label className="wide">Linked customer request<select value={arrangementForm.maintenance_request_id} onChange={(event) => setArrangementField("maintenance_request_id", event.target.value)}><option value="">No linked request</option>{selectedPaymentPlanRequests.map((request) => <option key={request.id} value={request.id}>{request.request_number || `Request ${request.id}`} | {label(request.priority)} priority</option>)}</select></label> : null}
        <label className="wide">Approval notes<textarea rows="2" value={arrangementForm.notes} onChange={(event) => setArrangementField("notes", event.target.value)} placeholder="Terms agreed with the customer" /></label>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={showStandingOrderForm}
      eyebrow="Bank mandate"
      title="Register bank mandate"
      description={selected ? `Keep the account brief visible while recording ${selected.customer_name}'s future bank-matching reference.` : ""}
      confirmLabel="Review mandate"
      cancelLabel="Cancel"
      reasonLabel={null}
      busy={savingStandingOrder}
      busyLabel="Reviewing..."
      onCancel={() => !savingStandingOrder && setShowStandingOrderForm(false)}
      onConfirm={reviewStandingOrder}
    >
      <div className="collection-arrangement-form">
        <label>Mandate reference<input value={standingOrderForm.mandate_reference} onChange={(event) => setStandingOrderField("mandate_reference", event.target.value)} minLength="4" maxLength="80" placeholder="Narrative marker from bank" required /></label>
        <label>Expected amount<input type="number" min="0.01" step="0.01" value={standingOrderForm.expected_amount} onChange={(event) => setStandingOrderField("expected_amount", event.target.value)} required /></label>
        <label>Frequency<select value={standingOrderForm.frequency} onChange={(event) => setStandingOrderField("frequency", event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>First due date<input type="date" value={standingOrderForm.first_due_date} onChange={(event) => setStandingOrderField("first_due_date", event.target.value)} required /></label>
        <label className="wide">Notes<textarea rows="2" value={standingOrderForm.notes} onChange={(event) => setStandingOrderField("notes", event.target.value)} placeholder="Bank, mandate evidence, or customer agreement" /></label>
        <p className="form-note wide">A mandate helps reconciliation identify a confirmed bank payment. It never creates a receipt by itself.</p>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(closingArrangement)}
      eyebrow="Payment-plan outcome"
      title={`Close ${closingArrangement?.arrangement_number || "payment plan"}`}
      description="Record the outcome before the plan is closed. Receipts and allocations stay unchanged."
      confirmLabel="Review outcome"
      cancelLabel="Cancel"
      reasonLabel={null}
      busy={savingArrangement}
      busyLabel="Reviewing..."
      onCancel={() => !savingArrangement && setClosingArrangement(null)}
      onConfirm={reviewArrangementClosure}
    >
      <div className="collection-arrangement-form">
        <label>Outcome<select value={closingDraft.status} onChange={(event) => setClosingDraft((current) => ({ ...current, status: event.target.value }))}><option value="completed">Completed</option><option value="defaulted">Defaulted</option><option value="cancelled">Cancelled</option></select></label>
        <label className="wide">Closure notes<textarea rows="2" value={closingDraft.closure_notes} onChange={(event) => setClosingDraft((current) => ({ ...current, closure_notes: event.target.value }))} required /></label>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(standingOrderStatusDraft)}
      eyebrow="Bank-mandate status"
      title={`Update ${standingOrderStatusDraft?.order?.mandate_reference || "bank mandate"}`}
      description="Record the mandate status without creating, voiding, or allocating a receipt."
      confirmLabel="Review status"
      cancelLabel="Cancel"
      reasonLabel={null}
      busy={savingStandingOrder}
      busyLabel="Reviewing..."
      onCancel={() => !savingStandingOrder && setStandingOrderStatusDraft(null)}
      onConfirm={reviewStandingOrderStatus}
    >
      <div className="collection-arrangement-form">
        <label>Status<select value={standingOrderStatusDraft?.status || "paused"} onChange={(event) => setStandingOrderStatusDraft((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label>
        <label className="wide">Status-change note<textarea rows="2" value={standingOrderStatusDraft?.reason || ""} onChange={(event) => setStandingOrderStatusDraft((current) => ({ ...current, reason: event.target.value }))} required /></label>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(arrangementClosureReview)}
      eyebrow="Payment-plan outcome"
      title={`Record ${label(arrangementClosureReview?.status)} outcome`}
      description={arrangementClosureReview ? `This marks ${arrangementClosureReview.arrangement.arrangement_number} as ${label(arrangementClosureReview.status)}. It does not change bill allocation, receipts, or customer balance.` : ""}
      confirmLabel="Record outcome"
      cancelLabel="Return to outcome"
      reasonLabel={null}
      busy={savingArrangement}
      busyLabel="Recording..."
      onCancel={() => {
        if (savingArrangement) return;
        setArrangementClosureReview(null);
        setClosingArrangement(arrangementClosureReview?.arrangement || null);
      }}
      onConfirm={submitArrangementClosure}
    >
      <div className="review-summary-grid">
        <div><span>Plan</span><strong>{arrangementClosureReview?.arrangement.arrangement_number || "-"}</strong></div>
        <div><span>Outcome</span><strong>{label(arrangementClosureReview?.status)}</strong></div>
      </div>
      <div className="review-message-preview"><span>Closure note</span><p>{arrangementClosureReview?.closure_notes || "-"}</p></div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(standingOrderStatusReview)}
      eyebrow="Bank-mandate status"
      title={`Record ${label(standingOrderStatusReview?.status)} status`}
      description={standingOrderStatusReview ? `This changes ${standingOrderStatusReview.order.mandate_reference} to ${label(standingOrderStatusReview.status)}. It does not create, void, or allocate a receipt.` : ""}
      confirmLabel="Record status"
      cancelLabel="Return to status"
      reasonLabel={null}
      busy={savingStandingOrder}
      busyLabel="Recording..."
      onCancel={() => {
        if (savingStandingOrder) return;
        setStandingOrderStatusReview(null);
        setStandingOrderStatusDraft(standingOrderStatusReview || null);
      }}
      onConfirm={submitStandingOrderStatus}
    >
      <div className="review-summary-grid">
        <div><span>Mandate</span><strong>{standingOrderStatusReview?.order.mandate_reference || "-"}</strong></div>
        <div><span>New status</span><strong>{label(standingOrderStatusReview?.status)}</strong></div>
      </div>
      <div className="review-message-preview"><span>Status-change note</span><p>{standingOrderStatusReview?.reason || "-"}</p></div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(standingOrderReview)}
      eyebrow="Bank-mandate review"
      title="Register standing order"
      description={standingOrderReview ? `This records ${standingOrderReview.mandate_reference} for ${standingOrderReview.customer_name} (${standingOrderReview.acc_number}) as a future bank-matching reference. It does not create a receipt or allocate a payment.` : ""}
      confirmLabel="Register mandate"
      cancelLabel="Return to mandate"
      reasonLabel="Registration notes"
      reasonPlaceholder="Record the mandate evidence, bank reference, or customer agreement"
      initialReason={standingOrderReview?.notes || ""}
      reasonRequired
      busy={savingStandingOrder}
      busyLabel="Registering..."
      onCancel={() => {
        if (savingStandingOrder) return;
        setStandingOrderReview(null);
        setShowStandingOrderForm(true);
      }}
      onConfirm={submitStandingOrder}
    >
      <div className="review-summary-grid">
        <div><span>Mandate reference</span><strong>{standingOrderReview?.mandate_reference || "-"}</strong></div>
        <div><span>Expected amount</span><strong>{money(standingOrderReview?.expected_amount)} {standingOrderReview?.frequency || ""}</strong></div>
        <div><span>First due</span><strong>{standingOrderReview?.first_due_date || "-"}</strong></div>
        <div><span>Receipt posting</span><strong>Not created</strong></div>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(arrangementReview)}
      eyebrow="Payment-plan approval"
      title="Approve payment plan"
      description={arrangementReview ? `This activates a ${arrangementReview.frequency} plan for ${arrangementReview.customer_name} (${arrangementReview.acc_number}) and resolves any linked customer proposal. It does not post or allocate a payment.` : ""}
      confirmLabel="Approve payment plan"
      cancelLabel="Return to terms"
      reasonLabel="Approval notes"
      reasonPlaceholder="Record the agreed terms, authority, or customer discussion"
      initialReason={arrangementReview?.notes || ""}
      reasonRequired
      busy={savingArrangement}
      busyLabel="Approving..."
      onCancel={() => {
        if (savingArrangement) return;
        setArrangementReview(null);
        setShowArrangementForm(true);
      }}
      onConfirm={submitArrangement}
    >
      <div className="review-summary-grid">
        <div><span>Agreed amount</span><strong>{money(arrangementReview?.agreed_amount)}</strong></div>
        <div><span>Instalment</span><strong>{money(arrangementReview?.installment_amount)} {arrangementReview?.frequency || ""}</strong></div>
        <div><span>First due</span><strong>{arrangementReview?.first_due_date || "-"}</strong></div>
        <div><span>Customer proposal</span><strong>{arrangementReview?.maintenance_request_id ? "Linked" : "None linked"}</strong></div>
      </div>
    </ReviewDialog>
    <ReviewDialog
      open={Boolean(decliningPaymentPlanRequest)}
      eyebrow="Customer proposal"
      title="Decline payment plan"
      description={decliningPaymentPlanRequest ? `${decliningPaymentPlanRequest.customer_name || "This customer"} proposed ${paymentPlanProposalSummary(decliningPaymentPlanRequest)}. This will close the request without creating a payment plan.` : ""}
      confirmLabel="Decline proposal"
      cancelLabel="Keep request open"
      reasonLabel="Decline reason"
      reasonPlaceholder="Explain what needs to change before a plan can be considered"
      reasonRequired
      danger
      busy={savingArrangement}
      busyLabel="Declining..."
      onCancel={() => !savingArrangement && setDecliningPaymentPlanRequest(null)}
      onConfirm={declinePaymentPlanRequest}
    />
  </section>;
}

export default CollectionsPage;
