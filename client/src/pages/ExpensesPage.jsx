import { Banknote, Download, Eye, FileUp, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { downloadCsvTemplate } from "../utils/csvTemplate";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const expenseImportHeaders = [
  "expense_date",
  "category",
  "vendor",
  "description",
  "amount",
  "payment_channel",
  "reference",
  "receipt_number",
  "notes"
];

function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: "",
    vendor: "",
    description: "",
    amount: "",
    payment_channel: "cash",
    reference: "",
    receipt_number: "",
    notes: ""
  });
  const [csvText, setCsvText] = useState("expense_date,category,vendor,description,amount,payment_channel,reference,receipt_number,notes\n");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  const importReady = useMemo(
    () => importPreview?.rows?.length > 0 && importPreview.summary.invalid === 0,
    [importPreview]
  );

  const load = async () => {
    setExpenses(await api.expenses.list());
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.expenses.create({ ...form, amount: Number(form.amount) });
      setForm({
        expense_date: new Date().toISOString().slice(0, 10),
        category: "",
        vendor: "",
        description: "",
        amount: "",
        payment_channel: "cash",
        reference: "",
        receipt_number: "",
        notes: ""
      });
      await load();
      setMessage("Expense recorded.");
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
      const preview = await api.expenses.previewImport(csvText);
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
      const result = await api.expenses.commitImport(csvText);
      setImportPreview(null);
      await load();
      setMessage(`Imported ${result.summary.imported} expense(s), total ${money(result.summary.totalAmount)}.`);
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
          <h2>Expenses</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="page-stack">
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>Record Expense</h3>
              <Banknote size={18} />
            </div>
            <label>
              Date
              <input value={form.expense_date} onChange={(event) => setField("expense_date", event.target.value)} type="date" required />
            </label>
            <label>
              Category
              <input value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="Fuel, repairs, salaries" required />
            </label>
            <label>
              Vendor / Payee
              <input value={form.vendor} onChange={(event) => setField("vendor", event.target.value)} />
            </label>
            <label>
              Description
              <input value={form.description} onChange={(event) => setField("description", event.target.value)} required />
            </label>
            <label>
              Amount
              <input value={form.amount} onChange={(event) => setField("amount", event.target.value)} type="number" min="1" required />
            </label>
            <label>
              Channel
              <select value={form.payment_channel} onChange={(event) => setField("payment_channel", event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="mpesa_paybill">M-Pesa/paybill</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </label>
            <label>
              Reference
              <input value={form.reference} onChange={(event) => setField("reference", event.target.value)} />
            </label>
            <label>
              Receipt number
              <input value={form.receipt_number} onChange={(event) => setField("receipt_number", event.target.value)} />
            </label>
            <label>
              Notes
              <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows="3" />
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <button className="primary-button" type="submit">
              <Save size={17} />
              Save expense
            </button>
          </form>

          <div className="panel form-grid">
            <div className="panel-heading">
              <h3>Import Expenses CSV</h3>
              <button
                type="button"
                onClick={() => downloadCsvTemplate("expenses-import-template.csv", expenseImportHeaders)}
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
                placeholder={"expense_date,category,vendor,description,amount,payment_channel,reference,receipt_number,notes\n2026-06-30,Fuel,Station A,Motorbike fuel,1200,cash,CASH-01,,Route readings"}
              />
            </label>
            <p className="muted">
              Required columns: expense_date, category, description, amount. Optional: vendor, payment_channel, reference, receipt_number, notes.
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
                  <span>Total amount</span>
                  <strong>{money(importPreview.summary.totalAmount)}</strong>
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
                      <th>Date</th>
                      <th>Category</th>
                      <th>Vendor</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.expense_date || "-"}</td>
                        <td>{row.category || "-"}</td>
                        <td>{row.vendor || "-"}</td>
                        <td>{row.description || "-"}</td>
                        <td>{row.amount === "" ? "-" : money(row.amount)}</td>
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
              <h3>Expense History</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Vendor</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Channel</th>
                    <th>Reference</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.expense_date?.slice(0, 10)}</td>
                      <td>{expense.category}</td>
                      <td>{expense.vendor || "-"}</td>
                      <td>{expense.description}</td>
                      <td>{money(expense.amount)}</td>
                      <td>{expense.payment_channel}</td>
                      <td>{expense.reference || expense.receipt_number || "-"}</td>
                      <td>{expense.recorded_by_name || "-"}</td>
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

export default ExpensesPage;
