import { ArrowLeft, ArrowRight } from "lucide-react";

function PaymentReconciliationMapping({ bankHeaders, bankMapping, fieldOptions, onBack, onMappingChange, onReview }) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Bank column</th><th>Payment field</th></tr>
          </thead>
          <tbody>
            {bankHeaders.map((header) => (
              <tr key={header}>
                <td>{header}</td>
                <td>
                  <select value={bankMapping[header] || ""} onChange={(event) => onMappingChange(header, event.target.value)}>
                    {fieldOptions.map((option) => <option key={option.key || "select"} value={option.key}>{option.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions bank-flow-actions">
        <button type="button" onClick={onBack}><ArrowLeft size={17} />Source</button>
        <button className="primary-button" type="button" onClick={onReview}>Review matches<ArrowRight size={17} /></button>
      </div>
    </>
  );
}

export default PaymentReconciliationMapping;
