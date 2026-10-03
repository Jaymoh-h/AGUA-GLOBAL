import { ArrowLeft, Banknote, FileText, Gauge, History, ReceiptText, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyTableRow } from "./EmptyState";
import StatusBadge from "./StatusBadge";
import { useToastMessage } from "./ToastProvider";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => value?.slice(0, 10) || "-";
const accountPosition = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");
const deliveryStateFor = (customer) => {
  const enabledChannels = [
    ["email", customer.email_delivery_enabled !== false, customer.email],
    ["sms", Boolean(customer.sms_delivery_enabled), customer.phone],
    ["whatsapp", Boolean(customer.whatsapp_delivery_enabled), customer.phone]
  ];
  const enabled = enabledChannels.filter(([, isEnabled]) => isEnabled);
  if (!enabled.length) return { status: "opted_out", label: "Opted out" };
  const preferred = customer.preferred_delivery_channel || "email";
  const preferredChannel = enabledChannels.find(([channel]) => channel === preferred);
  if (preferredChannel?.[1] && String(preferredChannel[2] || "").trim()) return { status: "ready", label: "Ready" };
  if (enabled.some(([, , contact]) => String(contact || "").trim())) return { status: "ready", label: "Ready" };
  return { status: "needs_contact", label: "Needs contact" };
};

const timelineItems = ({ bills, payments, readings, requests }) => [
  ...bills.map((bill) => ({
    key: `bill:${bill.id}`,
    type: "Bill",
    title: bill.charge_number || bill.bill_number || `Bill ${bill.id}`,
    detail: `${money(bill.balance_amount)} outstanding | ${String(bill.bill_pay_status || bill.status || "open").replaceAll("_", " ")}`,
    happenedAt: bill.created_at || bill.billing_month || bill.due_date,
    icon: FileText
  })),
  ...payments.map((payment) => ({
    key: `payment:${payment.id}`,
    type: "Receipt",
    title: payment.receipt_number || payment.reference || `Receipt ${payment.id}`,
    detail: `${money(payment.amount)} | ${String(payment.payment_channel || "payment").replaceAll("_", " ")}`,
    happenedAt: payment.payment_date || payment.created_at,
    icon: ReceiptText
  })),
  ...readings.map((reading) => ({
    key: `reading:${reading.id}`,
    type: "Reading",
    title: `${reading.meter_number || "Meter"} reading: ${reading.reading_value}`,
    detail: reading.bill_number ? `Billed as ${reading.bill_number}` : "Not yet billed",
    happenedAt: reading.reading_date || reading.created_at,
    icon: Gauge
  })),
  ...requests.map((request) => ({
    key: `request:${request.id}`,
    type: "Service",
    title: request.title || `Service request ${request.id}`,
    detail: `${String(request.status || "open").replaceAll("_", " ")} | ${request.assigned_to_name || "Unassigned"}`,
    happenedAt: request.reported_at || request.created_at,
    icon: Wrench
  }))
]
  .filter((item) => item.happenedAt)
  .sort((left, right) => new Date(right.happenedAt) - new Date(left.happenedAt))
  .slice(0, 12);

function Customer360Panel({ customer, initialTab, onClose, onEdit, onNavigate, onServiceCharges, onStatement, onCloseAccount }) {
  const [overview, setOverview] = useState(null);
  const [standingOrders, setStandingOrders] = useState([]);
  const [tab, setTab] = useState("timeline");
  const [, setMessage] = useToastMessage();

  useEffect(() => {
    let ignore = false;
    setOverview(null);
    Promise.all([api.customers.overview(customer.id), api.standingOrders.list({ customer_id: customer.id })])
      .then(([result, standingOrderRows]) => {
        if (!ignore) {
          setOverview(result);
          setStandingOrders(standingOrderRows);
        }
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [customer.id]);

  useEffect(() => {
    setTab(initialTab || "timeline");
  }, [customer.id, initialTab]);

  const data = overview?.customer || customer;
  const meters = overview?.meters || [];
  const readings = overview?.readings || [];
  const bills = overview?.bills || [];
  const payments = overview?.payments || [];
  const requests = overview?.requests || [];
  const documents = overview?.documents || [];
  const auditEvents = overview?.audit_events || [];
  const activeStandingOrder = standingOrders.find((order) => order.status === "active") || null;
  const activeMeter = meters.find((meter) => meter.status === "active") || meters[0];
  const deliveryState = deliveryStateFor(data);
  const activity = timelineItems({ bills, payments, readings, requests });
  const returnTarget = {
    page: "customers",
    focus: "customer_360",
    customer_id: data.id,
    customer_snapshot: {
      id: data.id,
      name: data.name,
      acc_number: data.acc_number,
      phone: data.phone,
      email: data.email,
      zone_name: data.zone_name,
      location: data.location,
      status: data.status
    },
    label: data.acc_number || data.name || "Customer account"
  };
  const openWorkflow = (page, focus, label) => onNavigate?.({
    page,
    focus,
    customer_id: data.id,
    label,
    return_target: returnTarget
  });

  return (
    <section className="panel customer-360-panel" aria-labelledby="customer-360-title">
      <header className="customer-360-header">
        <div>
          <p className="eyebrow">Customer record</p>
          <h3 id="customer-360-title">{data.name}</h3>
          <small>{data.acc_number} | {data.zone_name || data.location || "No zone"}</small>
        </div>
        <div className="row-actions">
          <button type="button" onClick={onClose}>
            <ArrowLeft size={16} />
            Back to register
          </button>
        </div>
      </header>

      {!overview ? (
        <div className="empty-state">
          <strong>Loading customer activity</strong>
          <span>Retrieving the account, meter, billing, receipt, service, document, and audit context.</span>
        </div>
      ) : (
        <>
          <div className="reading-context customer-360-summary">
            <div><span>{accountPosition(data.balance_due)}</span><strong>{money(Math.abs(Number(data.balance_due || 0)))}</strong></div>
            <div><span>Account status</span><strong><StatusBadge status={data.status} /></strong></div>
            <div><span>Deposit</span><strong>{data.deposit_paid ? "Paid" : "Not paid"} | {money(data.deposit_amount)}</strong></div>
            <div><span>Active meter</span><strong>{activeMeter?.meter_number || "No meter"}</strong></div>
            <div><span>Latest reading</span><strong>{activeMeter?.latest_reading_value ?? "-"}</strong></div>
            <div><span>Delivery</span><strong><StatusBadge status={deliveryState.status} /> {data.preferred_delivery_channel || "email"}</strong></div>
          </div>

          <div className="customer-360-record">
            <aside className="customer-360-identity-rail">
              <p className="eyebrow">Account identity</p>
              <strong>{data.acc_number}</strong>
              <StatusBadge status={data.status} />
              <dl className="customer-360-details">
                <div><dt>Phone</dt><dd>{data.phone || "-"}</dd></div>
                <div><dt>Email</dt><dd>{data.email || "-"}</dd></div>
                <div><dt>Zone</dt><dd>{data.zone_name || data.location || "-"}</dd></div>
                <div><dt>Rate</dt><dd>{data.rate_name || "-"} | {money(data.rate_amount || data.rate)}</dd></div>
                <div><dt>Delivery</dt><dd><StatusBadge status={deliveryState.status} /> {deliveryState.label}</dd></div>
                <div><dt>Mandate</dt><dd>{activeStandingOrder ? <><strong>{activeStandingOrder.mandate_reference}</strong><small>{money(activeStandingOrder.expected_amount)} {activeStandingOrder.frequency}</small></> : "No active mandate"}</dd></div>
              </dl>
            </aside>

            <div className="customer-360-main">
              <nav className="customer-360-tabs" aria-label="Customer record sections">
                {[
                  ["timeline", "Activity", History],
                  ["overview", "Account & meters", Gauge],
                  ["activity", "Bills & receipts", ReceiptText],
                  ["service", "Service & documents", Wrench],
                  ["history", "Audit", History]
                ].map(([key, label, Icon]) => (
                  <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </nav>

              {tab === "timeline" ? (
                <div className="customer-activity-timeline">
                  <div className="customer-activity-heading"><div><p className="eyebrow">Recent activity</p><h4>Account timeline</h4></div><small>{activity.length} recent events</small></div>
                  {activity.length ? activity.map((item) => {
                    const Icon = item.icon;
                    return <article className="customer-timeline-item" key={item.key}><span><Icon size={15} /></span><div><small>{item.type} | {date(item.happenedAt)}</small><strong>{item.title}</strong><p>{item.detail}</p></div></article>;
                  }) : <div className="empty-state"><strong>No recent activity</strong><span>Billing, reading, receipt, and service events will appear here.</span></div>}
                </div>
              ) : null}

              {tab === "overview" ? (
                <div className="customer-360-grid">
                  <div>
                    <h4>Service and delivery profile</h4>
                    <dl className="customer-360-details">
                      <div><dt>Deposit</dt><dd>{data.deposit_paid ? "Paid" : "Not paid"} | {money(data.deposit_amount)}</dd></div>
                      <div><dt>Invoice channels</dt><dd>{[data.email_delivery_enabled && "Email", data.sms_delivery_enabled && "SMS", data.whatsapp_delivery_enabled && "WhatsApp"].filter(Boolean).join(", ") || "None enabled"}</dd></div>
                      <div><dt>Preferred channel</dt><dd>{data.preferred_delivery_channel || "email"}</dd></div>
                    </dl>
                  </div>
                  <div>
                    <h4>Meters</h4>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Meter</th><th>Role</th><th>Latest reading</th><th>Status</th></tr></thead>
                        <tbody>{meters.length ? meters.map((meter) => <tr key={meter.id}><td>{meter.meter_number}</td><td>{meter.meter_role?.replaceAll("_", " ") || "-"}</td><td>{meter.latest_reading_value ?? "-"}<small>{date(meter.latest_reading_date)}</small></td><td><StatusBadge status={meter.status} /></td></tr>) : <EmptyTableRow colSpan={4} title="No meters found" detail="Add or review a meter before recording consumption." />}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "activity" ? (
                <div className="customer-360-activity">
              <div className="table-wrap"><table><caption>Recent bills</caption><thead><tr><th>Bill</th><th>Period</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>{bills.length ? bills.map((bill) => <tr key={bill.id}><td>{bill.charge_number || bill.bill_number}</td><td>{bill.billing_period_name || date(bill.billing_month)}</td><td>{date(bill.due_date)}</td><td>{money(bill.total_amount)}</td><td>{money(bill.balance_amount)}</td><td><StatusBadge status={bill.bill_pay_status || bill.status} /></td></tr>) : <EmptyTableRow colSpan={6} title="No bills found" detail="Billing activity will appear here." />}</tbody></table></div>
              <div className="table-wrap"><table><caption>Recent receipts</caption><thead><tr><th>Receipt</th><th>Date</th><th>Channel</th><th>Amount</th><th>Unallocated</th><th>Status</th></tr></thead><tbody>{payments.length ? payments.map((payment) => <tr key={payment.id}><td>{payment.receipt_number || payment.reference || `Payment ${payment.id}`}</td><td>{date(payment.payment_date)}</td><td>{payment.payment_channel?.replaceAll("_", " ") || "-"}</td><td>{money(payment.amount)}</td><td>{money(payment.unallocated_amount)}</td><td><StatusBadge status={payment.status} /></td></tr>) : <EmptyTableRow colSpan={6} title="No receipts found" detail="Posted receipts will appear here." />}</tbody></table></div>
              <div className="table-wrap"><table><caption>Recent readings</caption><thead><tr><th>Date</th><th>Meter</th><th>Reading</th><th>Period</th><th>Bill</th></tr></thead><tbody>{readings.length ? readings.map((reading) => <tr key={reading.id}><td>{date(reading.reading_date)}</td><td>{reading.meter_number || "-"}</td><td>{reading.reading_value}</td><td>{reading.billing_period_name || "-"}</td><td>{reading.bill_number || "Not issued"}</td></tr>) : <EmptyTableRow colSpan={5} title="No readings found" detail="Meter reading history will appear here." />}</tbody></table></div>
                </div>
              ) : null}

              {tab === "service" ? (
            <div className="customer-360-activity">
              <div className="table-wrap"><table><caption>Service requests</caption><thead><tr><th>Request</th><th>Reported</th><th>Priority</th><th>Assigned</th><th>Status</th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id}><td>{request.title}</td><td>{date(request.reported_at)}</td><td><StatusBadge status={request.priority} /></td><td>{request.assigned_to_name || "Unassigned"}</td><td><StatusBadge status={request.status} /></td></tr>) : <EmptyTableRow colSpan={5} title="No service requests" detail="Customer-related field work will appear here." />}</tbody></table></div>
              <div className="table-wrap"><table><caption>Documents from service requests</caption><thead><tr><th>File</th><th>Request</th><th>Uploaded</th><th>Notes</th></tr></thead><tbody>{documents.length ? documents.map((document) => <tr key={document.id}><td>{document.original_name}</td><td>{document.maintenance_request_title || `Request ${document.maintenance_request_id}`}</td><td>{date(document.created_at)}<small>{document.uploaded_by_name || "-"}</small></td><td>{document.description || "-"}</td></tr>) : <EmptyTableRow colSpan={4} title="No service documents" detail="Documents linked to this customer's maintenance requests will appear here." />}</tbody></table></div>
            </div>
              ) : null}

              {tab === "history" ? (
            <div className="audit-list">
              {auditEvents.length ? auditEvents.map((event) => <div className="audit-item" key={event.id}><div><strong>{event.action}</strong><small>{new Date(event.created_at).toLocaleString()}</small></div><span>{event.actor_name || "System"}</span><small>{event.reason || "No reason recorded"}</small></div>) : <div className="empty-state"><strong>No customer audit events</strong><span>Customer changes will appear here.</span></div>}
            </div>
              ) : null}
            </div>

            <aside className="customer-360-action-drawer" aria-label="Customer actions">
              <p className="eyebrow">Account actions</p>
              <button type="button" onClick={() => openWorkflow("payments", "prepare_payment", `Payment for ${data.acc_number || data.name}`)}><Banknote size={16} />Post payment</button>
              <button type="button" onClick={() => openWorkflow("readings", "capture_reading", `Reading for ${data.acc_number || data.name}`)}><Gauge size={16} />Capture reading</button>
              <button type="button" onClick={() => openWorkflow("maintenance", "create_customer_request", `Service request for ${data.acc_number || data.name}`)}><Wrench size={16} />Raise service request</button>
              <button className="primary-button" type="button" onClick={() => onEdit(data)}>{deliveryState.status === "ready" ? "Edit customer" : "Repair delivery"}</button>
              <button type="button" onClick={() => onStatement(data)}><FileText size={16} />Statement</button>
              <button type="button" onClick={() => onServiceCharges(data)}>Service charge</button>
              {data.status !== "inactive" ? <button className="customer-close-action" type="button" onClick={() => onCloseAccount(data)}>Close account</button> : null}
              <small>Each operational action keeps this account ready to reopen after the reviewed workflow is complete.</small>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

export default Customer360Panel;
