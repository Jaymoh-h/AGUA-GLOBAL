import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import EmptyState, { EmptyTableRow } from "../components/EmptyState";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const units = (value) => `${Number(value || 0).toLocaleString()} units`;

function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Loading dashboard...</p>;

  const monthlyRows = data.monthly || [];
  const latestBills = data.latestBills || [];
  const highConsumption = data.highConsumption || [];

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Dashboard</h2>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Water billed" value={units(data.summary.water_units_billed)} detail="From meter readings" />
        <StatCard label="Cash collected" value={money(data.summary.cash_collected)} detail="Posted payments" />
        <StatCard label="Bills due" value={data.summary.bills_due} detail="Unpaid or partial" />
        <StatCard label="Arrears" value={money(data.summary.arrears)} detail="Outstanding balance" />
        <StatCard label="Overdue" value={data.operations?.overdue_bills || 0} detail={money(data.operations?.overdue_amount)} />
        <StatCard label="Missing readings" value={data.operations?.missing_current_readings || 0} detail="Current month" />
        <StatCard label="Inactive with debt" value={data.operations?.inactive_accounts_with_debt || 0} detail="Closed accounts" />
        <StatCard label="Open maintenance" value={data.operations?.open_maintenance || 0} detail="Open or in progress" />
      </div>

      <section className="workspace-grid dashboard-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <h3>Monthly Summary</h3>
          </div>
          {monthlyRows.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="water_units" fill="#0f766e" name="Water units" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" fill="#2563eb" name="Collected" radius={[4, 4, 0, 0]} />
                <Bar dataKey="arrears" fill="#c2410c" name="Arrears" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No monthly summary" detail="Billing and payment activity will appear here once available." />
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Latest Bills</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {latestBills.length ? (
                  latestBills.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <strong>{bill.customer_name}</strong>
                        <small>{bill.acc_number}</small>
                      </td>
                      <td>{money(bill.amount)}</td>
                      <td>
                        <StatusBadge status={bill.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={3} title="No latest bills" detail="Recent bills will appear here after billing runs." />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>High Consumption</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {highConsumption.length ? (
                  highConsumption.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <strong>{bill.customer_name}</strong>
                        <small>{bill.acc_number}</small>
                      </td>
                      <td>{bill.bill_number || bill.billing_month?.slice(0, 10)}</td>
                      <td>{units(bill.units_used)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={3} title="No high consumption" detail="Accounts with unusually high usage will appear here." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

export default DashboardPage;
