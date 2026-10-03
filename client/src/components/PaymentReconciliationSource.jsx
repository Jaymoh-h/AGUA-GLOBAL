import { ArrowRight } from "lucide-react";

function PaymentReconciliationSource({
  bankCsvText,
  bankPaymentChannel,
  bankPdfFile,
  bankPdfNeedsPassword,
  bankPdfPassword,
  bankProfileName,
  bankProfiles,
  mpesaIntegration,
  onChannelChange,
  onCsvChange,
  onDetect,
  onFileChange,
  onPdfPasswordChange,
  onProfileChange,
  onProfileNameChange,
  onReadPdf
}) {
  const isMpesa = bankPaymentChannel === "mpesa_paybill";

  return (
    <>
      <label>
        Incoming payment source
        <select value={bankPaymentChannel} onChange={(event) => onChannelChange(event.target.value)}>
          <option value="bank">Bank statement</option>
          <option value="mpesa_paybill">M-Pesa paybill statement</option>
        </select>
        <small>
          {isMpesa && mpesaIntegration?.enabled
            ? "Live M-Pesa confirmations are active. Statement reconciliation remains available for settlement checks."
            : "M-Pesa rows require a completed transaction status and a transaction reference before they can be imported."}
        </small>
      </label>
      <label>
        {isMpesa ? "M-Pesa statement file" : "Bank statement file"}
        <input type="file" accept=".pdf,application/pdf,.csv,text/csv" onChange={onFileChange} />
      </label>
      <div className="filter-bar">
        <label>
          Bank profile
          <select value={bankProfileName} onChange={(event) => onProfileChange(event.target.value)}>
            <option value="Default">Default</option>
            {Object.keys(bankProfiles).filter((name) => name !== "Default").map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Profile name
          <input
            value={bankProfileName}
            onChange={(event) => onProfileNameChange(event.target.value)}
            placeholder="e.g. Equity, KCB, Cooperative"
          />
        </label>
      </div>
      <label>
        PDF password
        <input
          value={bankPdfPassword}
          onChange={(event) => onPdfPasswordChange(event.target.value)}
          type="password"
          placeholder="Only needed for protected PDF statements"
        />
      </label>
      {bankPdfFile ? (
        <button type="button" onClick={onReadPdf}>
          {bankPdfNeedsPassword ? "Retry with password" : "Re-read PDF"}
        </button>
      ) : null}
      <label>
        Extracted statement table or CSV content
        <textarea
          value={bankCsvText}
          onChange={(event) => onCsvChange(event.target.value)}
          rows="5"
          placeholder="Upload a PDF statement to extract a CSV-like table, or paste CSV content here and detect columns."
        />
      </label>
      <button className="primary-button" type="button" onClick={onDetect} disabled={!bankCsvText.trim()}>
        Detect columns from content
        <ArrowRight size={17} />
      </button>
    </>
  );
}

export default PaymentReconciliationSource;
