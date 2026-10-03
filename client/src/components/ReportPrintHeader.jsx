export default function ReportPrintHeader({ assetUrl, businessSettings, printedAt, reportPeriod, reportTitle }) {
  return (
    <div className="report-print-header">
      {businessSettings?.logo_url ? (
        <img className="receipt-logo" src={assetUrl(businessSettings.logo_url)} alt="Business logo" />
      ) : (
        <div className="receipt-logo-mark">{businessSettings?.business_name?.slice(0, 2) || "AG"}</div>
      )}
      <div className="report-print-business">
        <h3>{businessSettings?.business_name || "Water Billing"}</h3>
        {businessSettings?.legal_name ? <p className="print-business-legal">{businessSettings.legal_name}</p> : null}
        {businessSettings?.physical_address ? <p className="print-business-address">{businessSettings.physical_address}</p> : null}
        <p className="print-business-contact">{[businessSettings?.phone, businessSettings?.email].filter(Boolean).join(" | ")}</p>
        {businessSettings?.tax_pin ? <p className="print-business-tax">PIN: {businessSettings.tax_pin}</p> : null}
      </div>
      <div className="report-print-meta">
        <span>{reportTitle}</span>
        <strong>{reportPeriod}</strong>
        <small>Printed {printedAt}</small>
      </div>
    </div>
  );
}
