import { FileSpreadsheet, Printer } from "lucide-react";

function ReportPanelHeading({ title, printLabel, onPrint = null, showSpreadsheet = false, compact = false }) {
  return (
    <div className={`panel-heading${compact ? " compact-heading" : ""}`}>
      <h3>{title}</h3>
      {showSpreadsheet || onPrint ? (
        <div className="row-actions">
          {showSpreadsheet ? <FileSpreadsheet size={18} aria-hidden="true" /> : null}
          {onPrint ? (
            <button className="icon-button screen-only" type="button" onClick={onPrint} title={`Print ${printLabel}`}>
              <Printer size={17} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ReportPanelHeading;
