import StatCard from "./StatCard";

export default function ReportSummaryCards({ items }) {
  return (
    <div className="stat-grid report-summary-section">
      {items.map((item) => <StatCard key={item.label} {...item} />)}
    </div>
  );
}
