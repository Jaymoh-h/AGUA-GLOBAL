import { Gauge } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

export default function ReadingGapsPanel({ customers, onSelectCustomer, readingEligibility }) {
  return (
    <CollapsibleSection
      defaultOpen
      icon={<Gauge size={18} />}
      summary={`${customers.length.toLocaleString()} customer(s)`}
      title={`${readingEligibility?.period?.name || "Period"} Reading Gaps`}
    >
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Account</th><th>Zone</th><th>Suggested Date</th><th>Latest Reading</th><th>Balance</th><th>Action</th></tr></thead>
          <tbody>
            {customers.length ? customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.acc_number}</td>
                <td>{customer.zone_name || customer.location || "-"}</td>
                <td>{customer.suggested_reading_date || readingEligibility?.period?.periodEnd || "-"}</td>
                <td>
                  {customer.latest_reading_value === null || customer.latest_reading_value === undefined ? "Baseline" : Number(customer.latest_reading_value).toLocaleString()}
                  <small>{customer.latest_reading_date?.slice(0, 10) || "No earlier reading"}</small>
                </td>
                <td>{money(customer.balance_due)}</td>
                <td><button type="button" onClick={() => onSelectCustomer(customer.id)}>Select</button></td>
              </tr>
            )) : <EmptyTableRow colSpan={7} title="No reading gaps" detail="All active metered customers have a reading for this period." />}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
