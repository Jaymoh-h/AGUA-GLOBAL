import { Printer } from "lucide-react";

export default function ReportCatalog({ activeKey, description, items, onPrint = null, onSelect, title, variant = "" }) {
  return (
    <div className={`panel screen-only report-catalog-panel ${variant}`.trim()}>
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
      </div>
      <div className="report-catalog">
        {items.map((report) => (
          <article className={activeKey === report.key ? "report-catalog-item active" : "report-catalog-item"} key={report.key}>
            <button className="report-catalog-open" onClick={() => onSelect(report.key)} type="button">
              <strong>{report.title}</strong>
              <span>{report.detail}</span>
            </button>
            {onPrint ? <button className="icon-button report-catalog-print" type="button" onClick={() => onPrint(report.key)} title={`Print ${report.title}`} aria-label={`Print ${report.title}`}><Printer size={16} /></button> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
