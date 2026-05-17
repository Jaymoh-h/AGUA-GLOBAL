import { Building2, Save, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { api, assetUrl } from "../services/api";

const blankSettings = {
  business_name: "",
  legal_name: "",
  logo_url: "",
  phone: "",
  email: "",
  physical_address: "",
  postal_address: "",
  tax_pin: "",
  paybill_number: "",
  till_number: "",
  bank_details: "",
  receipt_footer_note: "",
  report_footer_note: "",
  default_currency: "KES"
};

const valueOrEmpty = (value) => value ?? "";

function BusinessSettingsPage({ user }) {
  const [settings, setSettings] = useState(blankSettings);
  const [message, setMessage] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const canEdit = user.role === "admin";

  useEffect(() => {
    api.businessSettings
      .get()
      .then((row) =>
        setSettings({
          business_name: valueOrEmpty(row.business_name),
          legal_name: valueOrEmpty(row.legal_name),
          logo_url: valueOrEmpty(row.logo_url),
          phone: valueOrEmpty(row.phone),
          email: valueOrEmpty(row.email),
          physical_address: valueOrEmpty(row.physical_address),
          postal_address: valueOrEmpty(row.postal_address),
          tax_pin: valueOrEmpty(row.tax_pin),
          paybill_number: valueOrEmpty(row.paybill_number),
          till_number: valueOrEmpty(row.till_number),
          bank_details: valueOrEmpty(row.bank_details),
          receipt_footer_note: valueOrEmpty(row.receipt_footer_note),
          report_footer_note: valueOrEmpty(row.report_footer_note),
          default_currency: valueOrEmpty(row.default_currency) || "KES"
        })
      )
      .catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setSettings((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const updated = await api.businessSettings.update(settings);
      setSettings({
        ...settings,
        ...Object.fromEntries(Object.entries(updated).map(([key, value]) => [key, valueOrEmpty(value)]))
      });
      setMessage("Business settings saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected logo file."));
      reader.readAsDataURL(file);
    });

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setUploadingLogo(true);
    try {
      const data = await readFileAsDataUrl(file);
      const updated = await api.businessSettings.uploadLogo({
        file_name: file.name,
        mime_type: file.type,
        data
      });
      setSettings({
        ...settings,
        ...Object.fromEntries(Object.entries(updated).map(([key, value]) => [key, valueOrEmpty(value)]))
      });
      setMessage("Logo uploaded.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Organization</p>
          <h2>Business Settings</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={save}>
          <div className="panel-heading">
            <h3>Identity</h3>
            <Building2 size={18} />
          </div>
          <label>
            Business name
            <input
              value={settings.business_name}
              onChange={(event) => setField("business_name", event.target.value)}
              disabled={!canEdit}
              required
            />
          </label>
          <label>
            Legal name
            <input
              value={settings.legal_name}
              onChange={(event) => setField("legal_name", event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <label>
            Logo URL or asset path
            <input
              value={settings.logo_url}
              onChange={(event) => setField("logo_url", event.target.value)}
              disabled={!canEdit}
              placeholder="/logo.png or https://..."
            />
          </label>
          {canEdit ? (
            <label>
              Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadLogo} disabled={uploadingLogo} />
            </label>
          ) : null}
          {settings.logo_url ? (
            <div className="logo-preview">
              <img src={assetUrl(settings.logo_url)} alt="Business logo preview" />
            </div>
          ) : null}
          <label>
            Default currency
            <input
              value={settings.default_currency}
              onChange={(event) => setField("default_currency", event.target.value.toUpperCase())}
              disabled={!canEdit}
              maxLength="10"
            />
          </label>

          <div className="panel-heading compact-heading">
            <h3>Contacts</h3>
          </div>
          <label>
            Phone
            <input value={settings.phone} onChange={(event) => setField("phone", event.target.value)} disabled={!canEdit} />
          </label>
          <label>
            Email
            <input
              value={settings.email}
              onChange={(event) => setField("email", event.target.value)}
              disabled={!canEdit}
              type="email"
            />
          </label>
          <label>
            Physical address
            <textarea
              value={settings.physical_address}
              onChange={(event) => setField("physical_address", event.target.value)}
              disabled={!canEdit}
              rows="3"
            />
          </label>
          <label>
            Postal address
            <textarea
              value={settings.postal_address}
              onChange={(event) => setField("postal_address", event.target.value)}
              disabled={!canEdit}
              rows="2"
            />
          </label>
          {message ? <p className="form-note">{message}</p> : null}
          {canEdit ? (
            <button className="primary-button" type="submit">
              {uploadingLogo ? <Upload size={17} /> : <Save size={17} />}
              {uploadingLogo ? "Uploading logo" : "Save business settings"}
            </button>
          ) : null}
        </form>

        <div className="page-stack wide-panel">
          <form className="panel form-grid" onSubmit={save}>
            <div className="panel-heading">
              <h3>Payment Details</h3>
            </div>
            <label>
              KRA PIN / Tax number
              <input value={settings.tax_pin} onChange={(event) => setField("tax_pin", event.target.value)} disabled={!canEdit} />
            </label>
            <label>
              Paybill number
              <input
                value={settings.paybill_number}
                onChange={(event) => setField("paybill_number", event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label>
              Till number
              <input value={settings.till_number} onChange={(event) => setField("till_number", event.target.value)} disabled={!canEdit} />
            </label>
            <label>
              Bank details
              <textarea
                value={settings.bank_details}
                onChange={(event) => setField("bank_details", event.target.value)}
                disabled={!canEdit}
                rows="4"
              />
            </label>
            <label>
              Receipt footer note
              <textarea
                value={settings.receipt_footer_note}
                onChange={(event) => setField("receipt_footer_note", event.target.value)}
                disabled={!canEdit}
                rows="3"
              />
            </label>
            <label>
              Report footer note
              <textarea
                value={settings.report_footer_note}
                onChange={(event) => setField("report_footer_note", event.target.value)}
                disabled={!canEdit}
                rows="3"
              />
            </label>
            {canEdit ? (
              <button className="primary-button" type="submit">
                <Save size={17} />
                Save print details
              </button>
            ) : null}
          </form>
        </div>
      </section>
    </section>
  );
}

export default BusinessSettingsPage;
