import { Download, Eye, FileUp, Gauge, Replace, Save, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { downloadCsvTemplate } from "../utils/csvTemplate";

const readingImportHeaders = ["acc_number", "reading_date", "reading_value", "meter_number", "notes"];

function ReadingsPage() {
  const [customers, setCustomers] = useState([]);
  const [readings, setReadings] = useState([]);
  const [meterEvents, setMeterEvents] = useState([]);
  const [form, setForm] = useState({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
  const [replacementForm, setReplacementForm] = useState({
    customer_id: "",
    old_final_reading: "",
    new_meter_number: "",
    new_initial_reading: "0",
    event_date: new Date().toISOString().slice(0, 10),
    reason: ""
  });
  const [replacementContext, setReplacementContext] = useState(null);
  const [readingContext, setReadingContext] = useState(null);
  const [csvText, setCsvText] = useState("acc_number,reading_date,reading_value,notes\n");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [customerRows, readingRows, eventRows] = await Promise.all([
      api.customers.list(),
      api.readings.list(),
      api.meters.events()
    ]);
    setCustomers(customerRows);
    setReadings(readingRows);
    setMeterEvents(eventRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setReplacementField = (field, value) =>
    setReplacementForm((current) => ({ ...current, [field]: value }));

  const importReady = useMemo(
    () => importPreview?.rows?.length > 0 && importPreview.summary.invalid === 0,
    [importPreview]
  );

  useEffect(() => {
    let ignore = false;

    if (!form.customer_id || !form.reading_date) {
      setReadingContext(null);
      return undefined;
    }

    api.readings
      .context(form.customer_id, form.reading_date)
      .then((context) => {
        if (!ignore) setReadingContext(context);
      })
      .catch((err) => {
        if (!ignore) {
          setReadingContext(null);
          setMessage(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [form.customer_id, form.reading_date]);

  useEffect(() => {
    let ignore = false;

    if (!replacementForm.customer_id || !replacementForm.event_date) {
      setReplacementContext(null);
      return undefined;
    }

    api.readings
      .context(replacementForm.customer_id, replacementForm.event_date)
      .then((context) => {
        if (!ignore) {
          setReplacementContext(context);
          setReplacementForm((current) => {
            if (current.old_final_reading) return current;
            return {
              ...current,
              old_final_reading: context.previousReading?.reading_value || ""
            };
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setReplacementContext(null);
          setMessage(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [replacementForm.customer_id, replacementForm.event_date]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        meter_id: readingContext?.activeMeter?.id,
        reading_value: Number(form.reading_value),
        reading_date: form.reading_date
      };
      const result = editingId
        ? await api.readings.update(editingId, payload)
        : await api.readings.create(payload);
      setForm({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
      setReadingContext(null);
      setEditingId(null);
      await load();
      setMessage(editingId ? "Reading updated and bills recalculated." : result.bill ? "Reading submitted and bill generated." : "Baseline reading submitted.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (reading) => {
    setEditingId(reading.id);
    setForm({
      customer_id: reading.customer_id || "",
      reading_value: reading.reading_value || "",
      reading_date: reading.reading_date?.slice(0, 10) || new Date().toISOString().slice(0, 10)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setReadingContext(null);
    setForm({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
  };

  const submitReplacement = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await api.meters.replace({
        customer_id: Number(replacementForm.customer_id),
        old_final_reading: Number(replacementForm.old_final_reading),
        new_meter_number: replacementForm.new_meter_number.trim(),
        new_initial_reading: Number(replacementForm.new_initial_reading || 0),
        event_date: replacementForm.event_date,
        reason: replacementForm.reason
      });
      setReplacementForm({
        customer_id: "",
        old_final_reading: "",
        new_meter_number: "",
        new_initial_reading: "0",
        event_date: new Date().toISOString().slice(0, 10),
        reason: ""
      });
      setReplacementContext(null);
      await load();
      setMessage("Meter replacement recorded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const previewImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.readings.previewImport(csvText);
      setImportPreview(preview);
      setMessage(
        preview.summary.invalid
          ? `${preview.summary.invalid} CSV row(s) need correction before import.`
          : `${preview.summary.valid} CSV row(s) ready to import.`
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const commitImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.readings.commitImport(csvText);
      await load();
      setImportPreview(null);
      setMessage(`Imported ${result.summary.imported} reading(s) and created ${result.summary.billsCreated} bill(s).`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Field Work</p>
          <h2>Meter Readings</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="page-stack">
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>{editingId ? "Edit Reading" : "Submit Reading"}</h3>
            </div>
            <label>
              Customer
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
            {readingContext ? (
              <div className="reading-context">
                <div>
                  <span>Active meter</span>
                  <strong>{readingContext.activeMeter?.meter_number || "-"}</strong>
                </div>
                <div>
                  <span>Previous reading</span>
                  <strong>
                    {readingContext.previousReading
                      ? Number(readingContext.previousReading.reading_value).toLocaleString()
                      : "Baseline"}
                  </strong>
                  <small>{readingContext.previousReading?.reading_date?.slice(0, 10) || "No earlier reading"}</small>
                </div>
                <div>
                  <span>Billing period</span>
                  <strong>{readingContext.billingPeriod?.name}</strong>
                  <small>Due {readingContext.billingPeriod?.dueDate}</small>
                </div>
              </div>
            ) : null}
            <label>
              Reading value
              <input
                value={form.reading_value}
                onChange={(event) => setField("reading_value", event.target.value)}
                type="number"
                min={readingContext?.previousReading?.reading_value || 0}
                required
              />
            </label>
            <label>
              Reading date
              <input value={form.reading_date} onChange={(event) => setField("reading_date", event.target.value)} type="date" required />
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <button className="primary-button" type="submit">
              {editingId ? <Save size={17} /> : <Send size={17} />}
              {editingId ? "Save reading" : "Submit reading"}
            </button>
            {editingId ? (
              <button type="button" onClick={cancelEdit}>
                Cancel edit
              </button>
            ) : null}
          </form>

          <form className="panel form-grid" onSubmit={submitReplacement}>
            <div className="panel-heading">
              <h3>Replace Meter</h3>
              <Replace size={18} />
            </div>
            <label>
              Customer
              <select
                value={replacementForm.customer_id}
                onChange={(event) => setReplacementField("customer_id", event.target.value)}
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
            {replacementContext ? (
              <div className="reading-context">
                <div>
                  <span>Current meter</span>
                  <strong>{replacementContext.activeMeter?.meter_number || "-"}</strong>
                </div>
                <div>
                  <span>Latest reading</span>
                  <strong>
                    {replacementContext.previousReading
                      ? Number(replacementContext.previousReading.reading_value).toLocaleString()
                      : "No reading"}
                  </strong>
                  <small>{replacementContext.previousReading?.reading_date?.slice(0, 10) || "Record a final reading"}</small>
                </div>
              </div>
            ) : null}
            <label>
              Replacement date
              <input
                value={replacementForm.event_date}
                onChange={(event) => setReplacementField("event_date", event.target.value)}
                type="date"
                required
              />
            </label>
            <label>
              Old final reading
              <input
                value={replacementForm.old_final_reading}
                onChange={(event) => setReplacementField("old_final_reading", event.target.value)}
                type="number"
                min={replacementContext?.previousReading?.reading_value || 0}
                required
              />
            </label>
            <label>
              New meter number
              <input
                value={replacementForm.new_meter_number}
                onChange={(event) => setReplacementField("new_meter_number", event.target.value)}
                required
              />
            </label>
            <label>
              New initial reading
              <input
                value={replacementForm.new_initial_reading}
                onChange={(event) => setReplacementField("new_initial_reading", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>
            <label>
              Reason
              <textarea
                value={replacementForm.reason}
                onChange={(event) => setReplacementField("reason", event.target.value)}
                rows="3"
              />
            </label>
            <button className="primary-button" type="submit">
              <Replace size={17} />
              Record replacement
            </button>
          </form>

          <div className="panel form-grid">
            <div className="panel-heading">
              <h3>Import Readings CSV</h3>
              <button
                type="button"
                onClick={() => downloadCsvTemplate("readings-import-template.csv", readingImportHeaders)}
              >
                <Download size={16} />
                Template
              </button>
            </div>
            <label>
              CSV file
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </label>
            <label>
              CSV content
              <textarea
                value={csvText}
                onChange={(event) => {
                  setCsvText(event.target.value);
                  setImportPreview(null);
                }}
                rows="7"
                placeholder={"acc_number,reading_date,reading_value,notes\nAG-0001,2026-06-30,240,End month route reading"}
              />
            </label>
            <p className="muted">
              Required columns: acc_number or customer_id, reading_date, reading_value. Optional: meter_number, notes.
            </p>
            {importPreview ? (
              <div className="reading-context">
                <div>
                  <span>Total rows</span>
                  <strong>{importPreview.summary.total}</strong>
                </div>
                <div>
                  <span>Valid</span>
                  <strong>{importPreview.summary.valid}</strong>
                </div>
                <div>
                  <span>Bills expected</span>
                  <strong>{importPreview.summary.billsExpected}</strong>
                </div>
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={previewImport} disabled={importing}>
              <Eye size={17} />
              Preview CSV
            </button>
            <button type="button" onClick={commitImport} disabled={!importReady || importing}>
              <FileUp size={17} />
              Import valid rows
            </button>
          </div>
        </div>

        <div className="page-stack wide-panel">
          {importPreview ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>CSV Preview</h3>
                <FileUp size={18} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Account</th>
                      <th>Customer</th>
                      <th>Meter</th>
                      <th>Date</th>
                      <th>Reading</th>
                      <th>Previous</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.acc_number || "-"}</td>
                        <td>{row.customer_name || "-"}</td>
                        <td>{row.meter_number || "-"}</td>
                        <td>{row.reading_date || "-"}</td>
                        <td>{row.reading_value === "" ? "-" : Number(row.reading_value).toLocaleString()}</td>
                        <td>
                          {row.previous_reading_value === null || row.previous_reading_value === undefined
                            ? "-"
                            : Number(row.previous_reading_value).toLocaleString()}
                        </td>
                        <td>
                          <span className={`status status-${row.status}`}>{row.status}</span>
                          {[...row.errors, ...row.warnings].map((item) => (
                            <small key={item}>{item}</small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-heading">
              <h3>Recent Readings</h3>
              <Gauge size={18} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Account</th>
                    <th>Meter</th>
                    <th>Previous</th>
                    <th>Reading</th>
                    <th>Date</th>
                    <th>Reader</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((reading) => (
                    <tr key={reading.id}>
                      <td>{reading.customer_name}</td>
                      <td>{reading.acc_number}</td>
                      <td>{reading.meter_number || "-"}</td>
                      <td>
                        {reading.previous_reading_value === null || reading.previous_reading_value === undefined
                          ? "-"
                          : Number(reading.previous_reading_value).toLocaleString()}
                        <small>{reading.previous_reading_date?.slice(0, 10) || ""}</small>
                      </td>
                      <td>{Number(reading.reading_value).toLocaleString()}</td>
                      <td>{reading.reading_date?.slice(0, 10)}</td>
                      <td>{reading.created_by_name || "-"}</td>
                      <td>
                        <button type="button" onClick={() => edit(reading)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h3>Meter Events</h3>
              <Replace size={18} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Old Meter</th>
                    <th>Old Final</th>
                    <th>New Meter</th>
                    <th>New Initial</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {meterEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.customer_name}</strong>
                        <small>{event.acc_number}</small>
                      </td>
                      <td>{event.event_date?.slice(0, 10)}</td>
                      <td>{event.old_meter_number || "-"}</td>
                      <td>{Number(event.old_final_reading || 0).toLocaleString()}</td>
                      <td>{event.new_meter_number || "-"}</td>
                      <td>{Number(event.new_initial_reading || 0).toLocaleString()}</td>
                      <td>{event.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

export default ReadingsPage;
