import { Download, FileText, MapPin, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useToastMessage } from "./ToastProvider";
import { api } from "../services/api";
import { downloadBlobFile } from "../utils/exportNames";

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const date = (value) => value?.slice(0, 10) || "-";
const maxDocumentBytes = 3 * 1024 * 1024;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

const readCurrentLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device cannot provide location evidence."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          type: "field_photo",
          location_consent: true,
          captured_at: new Date(position.timestamp).toISOString(),
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_m: position.coords.accuracy
          }
        }),
      () => reject(new Error("Location evidence was not captured. Check device permission and try again.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });

function SupportingDocumentsPanel({ entityType, entityId, customerId = "" }) {
  const [documents, setDocuments] = useState([]);
  const [description, setDescription] = useState("");
  const [captureLocation, setCaptureLocation] = useState(false);
  const [, setMessage] = useToastMessage();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setDocuments(await api.documents.list(entityType, entityId, customerId));
  };

  useEffect(() => {
    if (entityType && entityId) {
      load().catch((err) => setMessage(err.message));
    }
  }, [entityType, entityId, customerId]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > maxDocumentBytes) {
      event.target.value = "";
      setMessage("Document file must be 3MB or smaller.");
      return;
    }
    setMessage("");
    setSaving(true);
    try {
      if (captureLocation && !file.type.startsWith("image/")) {
        throw new Error("Location evidence can only be attached to a photo.");
      }
      const evidenceMetadata = captureLocation ? await readCurrentLocation() : undefined;
      const data = await readFileAsDataUrl(file);
      await api.documents.upload({
        entity_type: entityType,
        entity_id: entityId,
        customer_id: customerId || undefined,
        original_name: file.name,
        mime_type: file.type,
        data,
        description,
        evidence_metadata: evidenceMetadata
      });
      event.target.value = "";
      setDescription("");
      setCaptureLocation(false);
      await load();
      setMessage("Document uploaded.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const download = async (document) => {
    setMessage("");
    try {
      downloadBlobFile(await api.documents.download(document.id, customerId), document.original_name || "document");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const remove = async (document) => {
    setMessage("");
    try {
      await api.documents.remove(document.id, customerId);
      await load();
      setMessage("Document removed.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="supporting-documents-panel">
      <div className="panel-heading compact-heading">
        <h3>Supporting Documents</h3>
        <FileText size={18} />
      </div>
      <div className="document-upload-row">
        <label>
          Notes
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Invoice, receipt, photo, approval" />
        </label>
        <label className="document-file-input">
          <Upload size={16} />
          <span>{saving ? "Uploading..." : "Upload file"}</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={upload}
            disabled={saving}
          />
        </label>
        {["maintenance_request", "customer_reading_submission"].includes(entityType) && (
          <label className="document-location-consent">
            <input
              type="checkbox"
              checked={captureLocation}
              onChange={(event) => setCaptureLocation(event.target.checked)}
              disabled={saving}
            />
            <span>
              <MapPin size={15} /> Attach current location to this photo
              <small>Use only with consent. Permitted staff can review coordinates for 90 days; expired coordinates are removed when the record is next accessed.</small>
            </span>
          </label>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Notes</th>
              <th>Evidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? (
              documents.map((document) => (
                <tr key={document.id}>
                  <td>{document.original_name}</td>
                  <td>{formatBytes(document.file_size)}</td>
                  <td>
                    {date(document.created_at)}
                    <small>{document.uploaded_by_name || "-"}</small>
                  </td>
                  <td>{document.description || "-"}</td>
                  <td>
                    {document.evidence_metadata?.location ? (
                      <span className="document-evidence-location" title="Field location retained for review">
                        <MapPin size={14} /> GPS
                      </span>
                    ) : "-"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" type="button" onClick={() => download(document)} title="Download document">
                        <Download size={16} />
                      </button>
                      <button className="icon-button" type="button" onClick={() => remove(document)} title="Remove document">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="muted">
                  No supporting documents attached.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SupportingDocumentsPanel;
