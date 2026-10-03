import { FileUp } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function ReadingCsvPreview({ preview }) {
  return (
    <CollapsibleSection defaultOpen icon={<FileUp size={18} />} summary={`${preview.rows.length.toLocaleString()} row(s)`} title="CSV Preview">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Row</th><th>Account</th><th>Customer</th><th>Meter</th><th>Date</th><th>Reading</th><th>Previous</th><th>Status</th></tr></thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{row.acc_number || "-"}</td>
                <td>{row.customer_name || "-"}</td>
                <td>{row.meter_number || "-"}</td>
                <td>{row.reading_date || "-"}</td>
                <td>{row.reading_value === "" ? "-" : Number(row.reading_value).toLocaleString()}</td>
                <td>{row.previous_reading_value === null || row.previous_reading_value === undefined ? "-" : Number(row.previous_reading_value).toLocaleString()}</td>
                <td>
                  <span className={`status status-${row.status}`}>{row.status}</span>
                  {[...row.errors, ...row.warnings].map((item) => <small key={item}>{item}</small>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
