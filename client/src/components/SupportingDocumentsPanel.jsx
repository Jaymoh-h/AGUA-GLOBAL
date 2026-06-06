import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const date = (value) => value?.slice(0, 10) || "-";

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "document";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

function SupportingDocumentsPanel({ entityType, entityId }) {
  const [documents, setDocuments] = useState([]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setDocuments(await api.documents.list(entityType, entityId));
  };

  useEffect(() => {
    if (entityType && entityId) {
      load().catch((err) => setMessage(err.message));
    }
  }, [entityType, entityId]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setSaving(true);
    try {
      const data = await readFileAsDataUrl(file);
      await api.documents.upload({
        entity_type: entityType,
        entity_id: entityId,
        original_name: file.name,
        mime_type: file.type,
        data,
        description
      });
      event.target.value = "";
      setDescription("");
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
      downloadBlob(await api.documents.download(document.id), document.original_name);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const remove = async (document) => {
    setMessage("");
    try {
      await api.documents.remove(document.id);
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
      </div>
      {message ? <p className="form-note">{message}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Notes</th>
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
                <td colSpan="5" className="muted">
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
