import { FileUp } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

function PaymentImportPreview({ preview, money }) {
  if (!preview) return null;

  return (
    <CollapsibleSection
      defaultOpen
      icon={<FileUp size={18} />}
      summary={`${preview.summary.valid} valid of ${preview.summary.total} row(s) | ${money(preview.summary.totalAmount)}`}
      title="CSV Preview"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Account</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Channel</th>
              <th>Receipt</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{row.acc_number || "-"}</td>
                <td>{row.customer_name || "-"}</td>
                <td>{row.payment_date || "-"}</td>
                <td>{row.amount === "" ? "-" : money(row.amount)}</td>
                <td>{row.payment_channel}</td>
                <td>{row.receipt_number || "Auto"}</td>
                <td>
                  <span className={`status status-${row.status}`}>{row.status}</span>
                  {[...row.errors, ...row.warnings].map((item) => (
                    <small key={item}>{item}</small>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default PaymentImportPreview;
