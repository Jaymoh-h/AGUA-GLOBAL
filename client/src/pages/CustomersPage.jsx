import { Download, FileText, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, assetUrl } from "../services/api";
import { downloadCsvTemplate } from "../utils/csvTemplate";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const moneyAbs = (value) => `KES ${Math.abs(Number(value || 0)).toLocaleString()}`;
const accountPositionLabel = (value) => (Number(value || 0) < 0 ? "Customer credit" : "Amount due");

const blank = {
  name: "",
  phone: "",
  acc_number: "",
  rate_id: "",
  zone_id: "",
  deposit_amount: "",
  deposit_paid: false,
  opening_balance_amount: "",
  opening_balance_date: ""
};

const customerImportHeaders = [
  "name",
  "acc_number",
  "phone",
  "rate_name",
  "zone_name",
  "deposit_amount",
  "deposit_paid",
  "deposit_paid_at",
  "opening_balance_amount",
  "opening_balance_date",
  "status"
];

const openingBalanceImportHeaders = ["acc_number", "opening_balance_amount", "opening_balance_date"];

function CustomersPage({ user }) {
  const [customers, setCustomers] = useState([]);
  const [rates, setRates] = useState([]);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [business, setBusiness] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [statementStart, setStatementStart] = useState("");
  const [statementEnd, setStatementEnd] = useState("");
  const [statement, setStatement] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [openingCsvText, setOpeningCsvText] = useState("");
  const [openingImportPreview, setOpeningImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const canWrite = ["admin", "accountant"].includes(user.role);

  const load = async () => {
    const [customerRows, rateRows, zoneRows, businessSettings] = await Promise.all([
      api.customers.list(),
      api.rates.list(),
      api.zones.list(),
      canWrite ? api.businessSettings.get().catch(() => null) : Promise.resolve(null)
    ]);
    setCustomers(customerRows);
    setRates(rateRows);
    setZones(zoneRows);
    setBusiness(businessSettings);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const duplicate = customers.find(
      (customer) =>
        customer.acc_number.toLowerCase() === form.acc_number.toLowerCase() && customer.id !== editingId
    );
    if (duplicate) {
      setMessage("That account number is already in use.");
      return;
    }

    const payload = {
      ...form,
      rate_id: Number(form.rate_id),
      zone_id: Number(form.zone_id),
      deposit_amount: Number(form.deposit_amount || 0),
      deposit_paid: Boolean(form.deposit_paid),
      opening_balance_amount: Number(form.opening_balance_amount || 0),
      opening_balance_date: Number(form.opening_balance_amount || 0) !== 0 ? form.opening_balance_date : null
    };
    try {
      if (editingId) {
        await api.customers.update(editingId, payload);
      } else {
        await api.customers.create(payload);
      }
      setForm(blank);
      setEditingId(null);
      await load();
      setMessage("Customer saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      acc_number: customer.acc_number || "",
      rate_id: customer.rate_id || "",
      zone_id: customer.zone_id || "",
      deposit_amount: customer.deposit_amount || "",
      deposit_paid: Boolean(customer.deposit_paid),
      opening_balance_amount: customer.opening_balance_amount || "",
      opening_balance_date: customer.opening_balance_date ? customer.opening_balance_date.slice(0, 10) : ""
    });
  };

  const remove = async (id) => {
    await api.customers.remove(id);
    await load();
  };

  const openStatement = (customer) => {
    setStatementCustomer(customer);
    setStatement(null);
    setStatementStart("");
    setStatementEnd("");
    setMessage("");
  };

  const generateStatement = async (mode = "period") => {
    if (!statementCustomer) return;
    setMessage("");
    try {
      const params =
        mode === "lifetime"
          ? {}
          : {
              ...(statementStart ? { start_date: statementStart } : {}),
              ...(statementEnd ? { end_date: statementEnd } : {})
            };
      const result = await api.customers.statement(statementCustomer.id, params);
      setStatement(result);
      setMessage("Customer statement generated.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const printStatement = () => {
    if (!statement) return;
    window.print();
  };

  const previewImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.customers.previewImport(csvText);
      setImportPreview(preview);
      setMessage(`Preview ready: ${preview.summary.valid} valid, ${preview.summary.invalid} invalid.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const commitImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.customers.commitImport(csvText);
      setCsvText("");
      setImportPreview(null);
      await load();
      setMessage(`${result.inserted} customers imported.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const importReady = importPreview?.summary?.valid > 0 && importPreview?.summary?.invalid === 0;
  const openingImportReady =
    openingImportPreview?.summary?.valid > 0 && openingImportPreview?.summary?.invalid === 0;

  const previewOpeningBalanceImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.customers.previewOpeningBalanceImport(openingCsvText);
      setOpeningImportPreview(preview);
      setMessage(`Opening balance preview ready: ${preview.summary.valid} valid, ${preview.summary.invalid} invalid.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleOpeningCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOpeningCsvText(await file.text());
    setOpeningImportPreview(null);
  };

  const commitOpeningBalanceImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.customers.commitOpeningBalanceImport(openingCsvText);
      setOpeningCsvText("");
      setOpeningImportPreview(null);
      await load();
      setMessage(`${result.updated} opening balance(s) overwritten.`);
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
          <p className="eyebrow">Accounts</p>
          <h2>Customers</h2>
        </div>
      </header>

      <section className="workspace-grid">
        {canWrite ? (
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>{editingId ? "Edit Customer" : "Add Customer"}</h3>
            </div>
            <label>
              Name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
            </label>
            <label>
              Zone/location
              <select value={form.zone_id} onChange={(event) => setField("zone_id", event.target.value)} required>
                <option value="">Select zone/location</option>
                {zones
                  .filter((zone) => zone.is_active || Number(zone.id) === Number(form.zone_id))
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Account number
              <input value={form.acc_number} onChange={(event) => setField("acc_number", event.target.value)} required />
            </label>
            <label>
              Rate
              <select value={form.rate_id} onChange={(event) => setField("rate_id", event.target.value)} required>
                <option value="">Select rate</option>
                {rates
                  .filter((rate) => rate.is_active || Number(rate.id) === Number(form.rate_id))
                  .map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} - {Number(rate.amount).toLocaleString()}
                    </option>
                ))}
              </select>
            </label>
            <label>
              Deposit amount
              <input
                value={form.deposit_amount}
                onChange={(event) => setField("deposit_amount", event.target.value)}
                type="number"
                min="0"
              />
            </label>
            <label className="checkbox-row">
              <input
                checked={Boolean(form.deposit_paid)}
                onChange={(event) => setField("deposit_paid", event.target.checked)}
                type="checkbox"
              />
              Deposit paid
            </label>
            <label>
              Opening balance
              <input
                value={form.opening_balance_amount}
                onChange={(event) => setField("opening_balance_amount", event.target.value)}
                type="number"
                step="0.01"
              />
            </label>
            <label>
              Opening balance date
              <input
                value={form.opening_balance_date}
                onChange={(event) => setField("opening_balance_date", event.target.value)}
                type="date"
                required={Number(form.opening_balance_amount || 0) !== 0}
              />
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <button className="primary-button" type="submit">
              {editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? "Save changes" : "Add customer"}
            </button>
          </form>
        ) : null}

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Customer List</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Location</th>
                  <th>Rate</th>
                  <th>Deposit</th>
                  <th>Opening</th>
                  <th>Balance</th>
                  {canWrite ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                      <small>{customer.phone}</small>
                    </td>
                    <td>{customer.acc_number}</td>
                    <td>{customer.zone_name || customer.location}</td>
                    <td>
                      <strong>{customer.rate_name}</strong>
                      <small>{Number(customer.rate).toLocaleString()}</small>
                    </td>
                    <td>
                      <strong>{customer.deposit_paid ? "Paid" : "Not paid"}</strong>
                      <small>{Number(customer.deposit_amount || 0).toLocaleString()}</small>
                    </td>
                    <td>
                      <strong>{money(customer.opening_balance_amount)}</strong>
                      <small>{customer.opening_balance_date ? new Date(customer.opening_balance_date).toLocaleDateString() : "-"}</small>
                    </td>
                    <td>
                      <strong>{moneyAbs(customer.balance_due)}</strong>
                      <small>{accountPositionLabel(customer.balance_due)}</small>
                    </td>
                    {canWrite ? (
                      <td className="row-actions">
                        <button type="button" onClick={() => edit(customer)}>Edit</button>
                        <button type="button" onClick={() => openStatement(customer)} title="Generate customer statement">
                          <FileText size={15} />
                          Statement
                        </button>
                        {user.role === "admin" ? (
                          <button className="danger-button" type="button" onClick={() => remove(customer.id)} title="Delete customer">
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {canWrite ? (
        <section className="panel full-span form-grid">
          <div className="panel-heading">
            <div>
              <h3>Bulk Customer Import</h3>
              <p className="muted">CSV columns: name, acc_number, rate_id or rate_name, zone_id or zone_name.</p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsvTemplate("customer-import-template.csv", customerImportHeaders)}
            >
              <Download size={16} />
              Template
            </button>
          </div>
          <label>
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
          </label>
          <textarea
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setImportPreview(null);
            }}
            rows="6"
            placeholder="name,acc_number,phone,rate_name,zone_name,deposit_amount,deposit_paid,opening_balance_amount,opening_balance_date"
          />
          <div className="row-actions">
            <button className="primary-button" type="button" onClick={previewImport} disabled={importing || !csvText.trim()}>
              Preview import
            </button>
            <button type="button" onClick={commitImport} disabled={importing || !importReady}>
              Commit import
            </button>
          </div>

          {importPreview ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Account</th>
                    <th>Name</th>
                    <th>Rate</th>
                    <th>Zone</th>
                    <th>Deposit</th>
                    <th>Opening</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.acc_number || "-"}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.rate_name || "-"}</td>
                      <td>{row.zone_name || "-"}</td>
                      <td>
                        <strong>{Number(row.deposit_amount || 0).toLocaleString()}</strong>
                        <small>{row.deposit_paid ? "Paid" : "Not paid"}</small>
                      </td>
                      <td>
                        <strong>{Number(row.opening_balance_amount || 0).toLocaleString()}</strong>
                        <small>{row.opening_balance_date || "-"}</small>
                      </td>
                      <td>
                        <span className={`status status-${row.status_label}`}>{row.status_label}</span>
                        {[...row.errors, ...row.warnings].map((item) => (
                          <small key={item}>{item}</small>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {canWrite ? (
        <section className="panel full-span form-grid">
          <div className="panel-heading">
            <div>
              <h3>Opening Balance Overwrite</h3>
              <p className="muted">
                Use this to correct existing imported customers before payment import. Match rows by account number.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsvTemplate("opening-balances-overwrite-template.csv", openingBalanceImportHeaders)}
            >
              <Download size={16} />
              Template
            </button>
          </div>
          <label>
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={handleOpeningCsvFile} />
          </label>
          <textarea
            value={openingCsvText}
            onChange={(event) => {
              setOpeningCsvText(event.target.value);
              setOpeningImportPreview(null);
            }}
            rows="5"
            placeholder="acc_number,opening_balance_amount,opening_balance_date"
          />
          <div className="row-actions">
            <button
              className="primary-button"
              type="button"
              onClick={previewOpeningBalanceImport}
              disabled={importing || !openingCsvText.trim()}
            >
              Preview overwrite
            </button>
            <button type="button" onClick={commitOpeningBalanceImport} disabled={importing || !openingImportReady}>
              Commit overwrite
            </button>
          </div>

          {openingImportPreview ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Account</th>
                    <th>Name</th>
                    <th>Previous</th>
                    <th>Corrected</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openingImportPreview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.acc_number || "-"}</td>
                      <td>{row.name || "-"}</td>
                      <td>
                        <strong>{Number(row.previous_opening_balance_amount || 0).toLocaleString()}</strong>
                        <small>{row.previous_opening_balance_date || "-"}</small>
                      </td>
                      <td>
                        <strong>{Number(row.opening_balance_amount || 0).toLocaleString()}</strong>
                        <small>{row.opening_balance_date || "-"}</small>
                      </td>
                      <td>
                        <span className={`status status-${row.status_label}`}>{row.status_label}</span>
                        {[...row.errors, ...row.warnings].map((item) => (
                          <small key={item}>{item}</small>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {canWrite && statementCustomer ? (
        <section className="panel full-span">
          <div className="panel-heading">
            <div>
              <h3>Customer Statement</h3>
              <p className="muted">
                {statementCustomer.acc_number} - {statementCustomer.name}
              </p>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => generateStatement("lifetime")}>
                Lifetime
              </button>
              <button type="button" onClick={printStatement} disabled={!statement}>
                <Printer size={15} />
                Print
              </button>
            </div>
          </div>

          <div className="filter-bar statement-filter">
            <label>
              Start date
              <input value={statementStart} onChange={(event) => setStatementStart(event.target.value)} type="date" />
            </label>
            <label>
              End date
              <input value={statementEnd} onChange={(event) => setStatementEnd(event.target.value)} type="date" />
            </label>
            <button className="primary-button" type="button" onClick={() => generateStatement("period")}>
              Generate
            </button>
          </div>

          {statement ? (
            <div className="statement-preview">
              <div className="stat-grid">
                <div className="stat-card">
                  <span>Opening balance</span>
                  <strong>{money(statement.opening_balance)}</strong>
                </div>
                <div className="stat-card">
                  <span>Billed</span>
                  <strong>{money(statement.totals?.debit)}</strong>
                </div>
                <div className="stat-card">
                  <span>Paid</span>
                  <strong>{money(statement.totals?.credit)}</strong>
                </div>
                <div className="stat-card">
                  <span>{accountPositionLabel(statement.totals?.closing_balance)}</span>
                  <strong>{moneyAbs(statement.totals?.closing_balance)}</strong>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Description</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.transactions.length ? (
                      statement.transactions.map((row) => (
                        <tr key={`${row.transaction_type}-${row.id}-${row.transaction_date}`}>
                          <td>{new Date(row.transaction_date).toLocaleDateString()}</td>
                          <td>{row.reference}</td>
                          <td>{row.description}</td>
                          <td>{money(row.debit)}</td>
                          <td>{money(row.credit)}</td>
                          <td>{money(row.running_balance)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6">No bill or payment activity in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {statement ? (
        <section className="panel print-surface report-print active-print-surface customer-statement-print">
          <div className="report-print-header">
            {business?.logo_url ? (
              <img className="receipt-logo" src={assetUrl(business.logo_url)} alt={business.name || "Business logo"} />
            ) : (
              <span className="receipt-logo-mark">AG</span>
            )}
            <div>
              <h3>{business?.business_name || "Water Billing"}</h3>
              <p>Customer Statement</p>
              <p>{business?.phone || ""}</p>
            </div>
            <div className="report-print-meta">
              <span>Period</span>
              <strong>
                {statement.period.lifetime
                  ? "Lifetime"
                  : `${statement.period.start_date || "Start"} to ${statement.period.end_date || "End"}`}
              </strong>
              <small>Printed {new Date().toLocaleDateString()}</small>
            </div>
          </div>

          <div className="receipt-info-grid">
            <div>
              <span>Customer</span>
              <strong>{statement.customer.name}</strong>
            </div>
            <div>
              <span>Account</span>
              <strong>{statement.customer.acc_number}</strong>
            </div>
            <div>
              <span>Zone</span>
              <strong>{statement.customer.zone_name}</strong>
            </div>
            <div>
              <span>{accountPositionLabel(statement.totals.closing_balance)}</span>
              <strong>{moneyAbs(statement.totals.closing_balance)}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>-</td>
                  <td>Opening</td>
                  <td>Opening balance</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{money(statement.opening_balance)}</td>
                </tr>
                {statement.transactions.map((row) => (
                  <tr key={`print-${row.transaction_type}-${row.id}-${row.transaction_date}`}>
                    <td>{new Date(row.transaction_date).toLocaleDateString()}</td>
                    <td>{row.reference}</td>
                    <td>{row.description}</td>
                    <td>{money(row.debit)}</td>
                    <td>{money(row.credit)}</td>
                    <td>{money(row.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="receipt-total">
            <span>Totals</span>
            <strong>
              Billed {money(statement.totals.debit)} | Paid {money(statement.totals.credit)} |{" "}
              {accountPositionLabel(statement.totals.closing_balance)} {moneyAbs(statement.totals.closing_balance)}
            </strong>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default CustomersPage;
