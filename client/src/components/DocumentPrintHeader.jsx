import { assetUrl } from "../services/api";

export default function DocumentPrintHeader({ businessSettings, dateLabel, documentLabel, documentNumber }) {
  return (
    <div className="receipt-header document-print-header">
      {businessSettings?.logo_url ? (
        <img className="receipt-logo" src={assetUrl(businessSettings.logo_url)} alt="Business logo" />
      ) : (
        <div className="receipt-logo-mark">{businessSettings?.business_name?.slice(0, 2) || "AG"}</div>
      )}
      <div className="document-print-business">
        <h3>{businessSettings?.business_name || "Water Billing"}</h3>
        {businessSettings?.legal_name ? <p className="print-business-legal">{businessSettings.legal_name}</p> : null}
        {businessSettings?.physical_address ? <p className="print-business-address">{businessSettings.physical_address}</p> : null}
        <p className="print-business-contact">{[businessSettings?.phone, businessSettings?.email].filter(Boolean).join(" | ")}</p>
        {businessSettings?.tax_pin ? <p className="print-business-tax">PIN: {businessSettings.tax_pin}</p> : null}
      </div>
      <div className="document-print-meta">
        <span>{documentLabel}</span>
        <strong>{documentNumber}</strong>
        {dateLabel ? <small>{dateLabel}</small> : null}
      </div>
    </div>
  );
}
