import { MapPin, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EntryPanel from "../components/EntryPanel";
import { EmptyTableRow } from "../components/EmptyState";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import ReviewDialog from "../components/ReviewDialog";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";

const blank = { name: "", description: "", is_active: true };

function ZonesPage() {
  const [zones, setZones] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [review, setReview] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [, setMessage] = useToastMessage();

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      setZones(await api.zones.list());
    } catch (err) {
      if (showState) setInitialError(err.message || "Zone records could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const resetEntry = () => {
    setForm(blank);
    setEditingId(null);
    setEntryOpen(false);
  };

  const setEntryPanelOpen = (open) => {
    if (open) {
      setEntryOpen(true);
      return;
    }
    resetEntry();
  };

  const saveZone = async (reviewNotes) => {
    try {
      const payload = { ...form, review_notes: reviewNotes };
      if (editingId) {
        await api.zones.update(editingId, payload);
      } else {
        await api.zones.create(payload);
      }
      resetEntry();
      await load();
      setMessage("Zone/location saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setMessage("");
    setReview({ mode: editingId ? "update" : "create", previous: zones.find((zone) => Number(zone.id) === Number(editingId)) || null });
  };

  const confirmReview = async (reviewNotes) => {
    setReviewBusy(true);
    try {
      await saveZone(reviewNotes);
      setReview(null);
    } finally {
      setReviewBusy(false);
    }
  };

  const edit = (zone) => {
    setEditingId(zone.id);
    setEntryOpen(true);
    setForm({
      name: zone.name || "",
      description: zone.description || "",
      is_active: zone.is_active
    });
  };
  const zoneTable = useTableControls(zones, {
    searchFields: ["name", "description", "is_active"]
  });
  const activeZones = useMemo(() => zones.filter((zone) => zone.is_active).length, [zones]);

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving field coverage and service-location references." title="Preparing field coverage" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={() => load({ showState: true }).catch(() => {})}
        state="error"
        title="Field coverage could not load"
      />
    );
  }

  return (
    <section className="page-stack zone-control-page">
      <header className="page-header zone-control-header">
        <div>
          <p className="eyebrow">Reference Data</p>
          <h2>Field coverage</h2>
          <p>Maintain the locations used to organize customers, meter work, collection follow-up, and service delivery.</p>
        </div>
      </header>

      <section className="zone-control-metrics" aria-label="Zone coverage">
        <div><span>Active zones</span><strong>{activeZones}</strong><small>Available for operations</small></div>
        <div className={zones.length - activeZones ? "needs-attention" : ""}><span>Inactive zones</span><strong>{zones.length - activeZones}</strong><small>Review before reassignment</small></div>
        <div><span>Total locations</span><strong>{zones.length}</strong><small>In the operating register</small></div>
      </section>

      <section className="workspace-grid entry-led-workspace zone-control-workspace">
        <EntryPanel
          actionLabel="Add zone"
          className="zone-entry-panel"
          disabled={reviewBusy || Boolean(review)}
          icon={<MapPin size={17} />}
          onOpenChange={setEntryPanelOpen}
          open={entryOpen}
          summary={editingId ? "Update a service location" : "Create a service location"}
          title={editingId ? "Edit zone/location" : "Zone/location entry"}
        >
          <form className="form-grid" onSubmit={submit}>
            <label>
              Zone/location name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows="3" />
            </label>
            <label className="checkbox-row">
              <input
                checked={form.is_active}
                onChange={(event) => setField("is_active", event.target.checked)}
                type="checkbox"
              />
              Active
            </label>
            <button className="primary-button" type="submit" disabled={reviewBusy || Boolean(review)}>
              {editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? "Save changes" : "Add zone"}
            </button>
          </form>
        </EntryPanel>

        <div className="panel wide-panel register-panel zone-register-panel">
          <div className="panel-heading">
            <h3>Zone/Location List</h3>
          </div>
          <TableControls table={zoneTable} label="zones" placeholder="Search zones" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zoneTable.visibleRows.length ? (
                  zoneTable.visibleRows.map((zone) => (
                    <tr key={zone.id}>
                      <td>{zone.name}</td>
                      <td>{zone.is_active ? "Active" : "Inactive"}</td>
                      <td>{zone.description || "-"}</td>
                      <td>
                        <button type="button" onClick={() => edit(zone)}>Edit</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={4} title="No zones found" detail="Add a zone or adjust the search." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <ReviewDialog
        open={Boolean(review)}
        eyebrow="Location review"
        title={review?.mode === "create" ? "Create zone/location" : "Save zone/location changes"}
        description={form.is_active ? "This updates the field-coverage reference data used by customer assignment and operations. It does not move customers, create work, or send notifications." : "This makes the location unavailable for new customer assignments. Existing customer records remain assigned and no work, billing, or notification is created."}
        confirmLabel={review?.mode === "create" ? "Create zone/location" : "Save zone/location"}
        cancelLabel="Keep editing"
        reasonLabel="Location approval note"
        reasonPlaceholder="Record the operating basis and authority for this location change"
        busy={reviewBusy}
        onCancel={() => !reviewBusy && setReview(null)}
        onConfirm={confirmReview}
      >
        {review ? <div className="reading-context">
          <div><span>Location</span><strong>{form.name}</strong></div>
          <div><span>Status</span><strong>{form.is_active ? "Active for new assignments" : "Inactive for new assignments"}</strong></div>
          <div><span>Existing customers</span><strong>{review.previous ? "Remain linked to this location" : "None assigned by this action"}</strong></div>
          <div><span>Operational consequence</span><strong>No work, billing, or notification is created</strong></div>
        </div> : null}
      </ReviewDialog>
    </section>
  );
}

export default ZonesPage;
