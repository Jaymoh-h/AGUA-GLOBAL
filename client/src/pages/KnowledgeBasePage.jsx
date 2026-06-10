import { Archive, Download, FileText, Pencil, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import { api } from "../services/api";
import { downloadBlobFile } from "../utils/exportNames";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "accountant", label: "Accountant" },
  { value: "meter_reader", label: "Meter reader" },
  { value: "business_viewer", label: "Business viewer" }
];

const initialForm = {
  title: "",
  category: "General",
  sensitivity: "internal",
  version_label: "v1",
  summary: "",
  allowed_roles: ["admin"],
  file: null
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "").replace(/_/g, " ");

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

function KnowledgeBasePage({ user }) {
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setMessage] = useToastMessage();
  const canManage = ["admin", "accountant"].includes(user.role);

  const categories = useMemo(
    () => [...new Set(documents.map((document) => document.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [documents]
  );

  const table = useTableControls(documents, {
    searchFields: ["title", "category", "sensitivity", "summary", "original_name", "version_label", "status"],
    pageSize: 10
  });

  const load = async () => {
    setLoading(true);
    try {
      setDocuments(await api.knowledgeDocuments.list());
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleRole = (role) => {
    setForm((current) => {
      const selected = new Set(current.allowed_roles);
      if (selected.has(role) && role !== "admin") selected.delete(role);
      else selected.add(role);
      selected.add("admin");
      return { ...current, allowed_roles: [...selected] };
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        category: form.category,
        sensitivity: form.sensitivity,
        version_label: form.version_label,
        summary: form.summary,
        allowed_roles: form.allowed_roles
      };

      if (editing) {
        payload.reason = "Knowledge document metadata updated.";
        await api.knowledgeDocuments.update(editing.id, payload);
        setMessage("Knowledge document updated.");
      } else {
        if (!form.file) throw new Error("Choose a document file to upload.");
        const data = await readFileAsDataUrl(form.file);
        await api.knowledgeDocuments.upload({
          ...payload,
          original_name: form.file.name,
          mime_type: form.file.type,
          data
        });
        setMessage("Knowledge document uploaded.");
      }
      resetForm();
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const editDocument = (document) => {
    setEditing(document);
    setForm({
      title: document.title || "",
      category: document.category || "General",
      sensitivity: document.sensitivity || "internal",
      version_label: document.version_label || "v1",
      summary: document.summary || "",
      allowed_roles: document.allowed_roles?.length ? document.allowed_roles : ["admin"],
      file: null
    });
  };

  const download = async (document) => {
    setMessage("");
    try {
      downloadBlobFile(await api.knowledgeDocuments.download(document.id), document.original_name || "knowledge-document");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const archive = async (document) => {
    const reason = window.prompt(`Reason for archiving "${document.title}":`);
    if (reason === null) return;
    setMessage("");
    try {
      await api.knowledgeDocuments.remove(document.id, reason);
      await load();
      setMessage("Knowledge document archived.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Internal knowledge</p>
          <h2>Knowledge Base</h2>
          <p>Private manuals, SOPs, setup notes, and controlled operational documents.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <section className="workspace-grid knowledge-grid">
        <div className="panel knowledge-register-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Library</p>
              <h3>Private documents</h3>
            </div>
            <FileText size={18} />
          </div>
          <TableControls table={table} exportName="knowledge-documents" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Access</th>
                  <th>File</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {table.visibleRows.length ? (
                  table.visibleRows.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <strong>{document.title}</strong>
                        <small>{document.summary || document.category}</small>
                      </td>
                      <td>
                        <span className={`status status-${document.sensitivity}`}>{label(document.sensitivity)}</span>
                        <small>{document.allowed_roles?.map(label).join(", ") || "admin"}</small>
                      </td>
                      <td>
                        {document.original_name}
                        <small>{formatBytes(document.file_size)} | {document.version_label}</small>
                      </td>
                      <td>
                        {date(document.updated_at)}
                        <small>{document.updated_by_name || document.uploaded_by_name || "-"}</small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" onClick={() => download(document)} title="Download document">
                            <Download size={16} />
                          </button>
                          {canManage ? (
                            <button className="icon-button" type="button" onClick={() => editDocument(document)} title="Edit metadata">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button className="icon-button danger-button" type="button" onClick={() => archive(document)} title="Archive document">
                              <Archive size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="muted">
                      {loading ? "Loading knowledge documents..." : "No knowledge documents available for your role."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {canManage ? (
          <form className="panel knowledge-editor-panel" onSubmit={submit}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editing ? "Metadata" : "Upload"}</p>
                <h3>{editing ? "Edit document" : "Add document"}</h3>
              </div>
              <ShieldCheck size={18} />
            </div>
            <label>
              Title
              <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} required maxLength="180" />
            </label>
            <div className="form-grid two-columns">
              <label>
                Category
                <input
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  list="knowledge-categories"
                  maxLength="80"
                />
                <datalist id="knowledge-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <label>
                Version
                <input value={form.version_label} onChange={(event) => updateForm("version_label", event.target.value)} maxLength="40" />
              </label>
            </div>
            <label>
              Sensitivity
              <select value={form.sensitivity} onChange={(event) => updateForm("sensitivity", event.target.value)}>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
            <fieldset className="role-check-grid">
              <legend>Allowed roles</legend>
              {roleOptions.map((role) => (
                <label key={role.value}>
                  <input
                    type="checkbox"
                    checked={form.allowed_roles.includes(role.value)}
                    disabled={role.value === "admin"}
                    onChange={() => toggleRole(role.value)}
                  />
                  {role.label}
                </label>
              ))}
            </fieldset>
            <label>
              Summary
              <textarea value={form.summary} onChange={(event) => updateForm("summary", event.target.value)} rows="4" />
            </label>
            {!editing ? (
              <label className="document-file-input knowledge-file-input">
                <Upload size={16} />
                <span>{form.file?.name || "Choose PDF, image, DOCX, or XLSX"}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => updateForm("file", event.target.files?.[0] || null)}
                  required
                />
              </label>
            ) : (
              <p className="muted">File replacement will be handled as a new version in a later slice. This edit only changes metadata and access.</p>
            )}
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={loading}>
                {editing ? "Save changes" : "Upload document"}
              </button>
              {editing ? (
                <button type="button" onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <aside className="panel knowledge-editor-panel">
            <div className="empty-state">
              <strong>Read-only access</strong>
              <span>Your role can download documents shared with you, but cannot upload or change knowledge base records.</span>
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}

export default KnowledgeBasePage;
