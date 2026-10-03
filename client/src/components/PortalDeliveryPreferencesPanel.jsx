import { Save } from "lucide-react";

function PortalDeliveryPreferencesPanel({ onFieldChange, onSubmit, preferences, saving }) {
  if (!preferences) return null;

  return <form className="panel portal-delivery-preferences" onSubmit={onSubmit}>
    <div className="panel-heading"><div><h3>Bill delivery preferences</h3><small>Choose which available channels can receive account messages.</small></div></div>
    <div className="portal-profile-grid">
      <label>
        Preferred channel
        <select value={preferences.preferred_delivery_channel} onChange={(event) => onFieldChange("preferred_delivery_channel", event.target.value)}>
          <option value="email" disabled={!preferences.email_delivery_enabled || !preferences.contacts?.email_available}>Email</option>
          <option value="sms" disabled={!preferences.sms_delivery_enabled || !preferences.contacts?.sms_available}>SMS</option>
          <option value="whatsapp" disabled={!preferences.whatsapp_delivery_enabled || !preferences.contacts?.whatsapp_available}>WhatsApp</option>
        </select>
      </label>
      <DeliveryChannel available={preferences.contacts?.email_available} checked={preferences.email_delivery_enabled} label="Email" unavailable="needs an email address" onChange={(value) => onFieldChange("email_delivery_enabled", value)} />
      <DeliveryChannel available={preferences.contacts?.sms_available} checked={preferences.sms_delivery_enabled} label="SMS" unavailable="needs a valid phone number" onChange={(value) => onFieldChange("sms_delivery_enabled", value)} />
      <DeliveryChannel available={preferences.contacts?.whatsapp_available} checked={preferences.whatsapp_delivery_enabled} label="WhatsApp" unavailable="needs a valid phone number" onChange={(value) => onFieldChange("whatsapp_delivery_enabled", value)} />
    </div>
    <button className="primary-button" type="submit" disabled={saving}><Save size={17} />{saving ? "Updating" : "Save delivery preferences"}</button>
  </form>;
}

function DeliveryChannel({ available, checked, label, onChange, unavailable }) {
  return <label className="checkbox-row"><input type="checkbox" checked={Boolean(checked)} disabled={!available} onChange={(event) => onChange(event.target.checked)} /><span>{label} {available ? "available" : unavailable}</span></label>;
}

export default PortalDeliveryPreferencesPanel;
