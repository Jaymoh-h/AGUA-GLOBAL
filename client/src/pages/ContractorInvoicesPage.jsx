import { Banknote, CheckCircle2, FileText, MoreHorizontal, Pencil, Plus, Save, Send, X, XCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import EntryPanel from "../components/EntryPanel";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import SupportingDocumentsPanel from "../components/SupportingDocumentsPanel";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");

const blankContractor = {
  name: "",
  phone: "",
  email: "",
  tax_pin: "",
  payment_terms_days: 30,
  status: "active",
  notes: ""
};

const blankInvoice = {
  contractor_id: "",
  invoice_number: "",
  invoice_date: today(),
  due_date: today(),
  category: "Contractor services",
  description: "",
  subtotal_amount: "",
  vat_amount: "0",
  total_amount: "",
  status: "submitted",
  notes: ""
};

const blankPostDraft = {
  expense_date: today(),
  payment_channel: "manual_adjustment",
  receipt_number: "",
  notes: ""
};

const openStatuses = ["draft", "submitted", "approved"];
const focusKeys = ["approved_supplier_invoices", "overdue_supplier_invoices"];

function ContractorInvoicesPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [contractors, setContractors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [contractorForm, setContractorForm] = useState(blankContractor);
  const [invoiceForm, setInvoiceForm] = useState(blankInvoice);
  const [editingContractorId, setEditingContractorId] = useState(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [contractorEntryOpen, setContractorEntryOpen] = useState(false);
  const [invoiceEntryOpen, setInvoiceEntryOpen] = useState(false);
  const [invoiceFilters, setInvoiceFilters] = useState({ status: "all", contractor_id: "", due: "all" });
  const [, setMessage] = useToastMessage();
  const [saving, setSaving] = useState(false);
  const [activeDocumentInvoiceId, setActiveDocumentInvoiceId] = useState(null);
  const [activePostInvoiceId, setActivePostInvoiceId] = useState(null);
  const [postDrafts, setPostDrafts] = useState({});
  const [invoiceReview, setInvoiceReview] = useState(null);
  const [invoiceReviewBusy, setInvoiceReviewBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const canManage = ["admin", "accountant"].includes(user?.role);

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const [nextContractors, nextInvoices] = await Promise.all([
        api.contractorInvoices.contractors(),
        api.contractorInvoices.invoices()
      ]);
      setContractors(nextContractors);
      setInvoices(nextInvoices);
    } catch (err) {
      if (showState) setInitialError(err.message || "Supplier invoices and contractor records could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  const totals = useMemo(
    () => ({
      open: invoices.filter((invoice) => openStatuses.includes(invoice.status)).length,
      approved: invoices.filter((invoice) => invoice.status === "approved").length,
      posted: invoices.filter((invoice) => invoice.status === "posted_to_expense").length,
      overdue: invoices.filter((invoice) => openStatuses.includes(invoice.status) && date(invoice.due_date) < today()).length,
      dueSoon: invoices.filter(
        (invoice) =>
          openStatuses.includes(invoice.status) &&
          date(invoice.due_date) >= today() &&
          date(invoice.due_date) <= addDays(14)
      ).length,
      overdueAmount: invoices
        .filter((invoice) => openStatuses.includes(invoice.status) && date(invoice.due_date) < today())
        .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
      openAmount: invoices
        .filter((invoice) => openStatuses.includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)
    }),
    [invoices]
  );

  const focusKey = navigationIntent?.page === "contractors" ? navigationIntent.focus : "";
  const hasSupplierFocus = focusKeys.includes(focusKey);
  const focusedTitle = focusKey === "approved_supplier_invoices" ? "Supplier invoices ready to post" : "Overdue supplier invoices";
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (focusKey === "approved_supplier_invoices") return invoice.status === "approved";
        if (focusKey === "overdue_supplier_invoices") return openStatuses.includes(invoice.status) && date(invoice.due_date) < today();
        if (invoiceFilters.status !== "all") {
          if (invoiceFilters.status === "open" && !openStatuses.includes(invoice.status)) return false;
          if (invoiceFilters.status !== "open" && invoice.status !== invoiceFilters.status) return false;
        }
        if (invoiceFilters.contractor_id && Number(invoice.contractor_id) !== Number(invoiceFilters.contractor_id)) return false;
        if (invoiceFilters.due === "overdue" && !(openStatuses.includes(invoice.status) && date(invoice.due_date) < today())) return false;
        if (
          invoiceFilters.due === "due_soon" &&
          !(openStatuses.includes(invoice.status) && date(invoice.due_date) >= today() && date(invoice.due_date) <= addDays(14))
        ) {
          return false;
        }
        return true;
      }),
    [focusKey, invoiceFilters, invoices]
  );

  const invoiceTable = useTableControls(filteredInvoices, {
    searchFields: ["invoice_number", "contractor_name", "description", "category", "status", "total_amount"]
  });

  const setContractorField = (field, value) => {
    setContractorForm((current) => ({ ...current, [field]: value }));
  };

  const setInvoiceField = (field, value) => {
    setInvoiceForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "subtotal_amount" || field === "vat_amount") {
        const subtotal = Number(field === "subtotal_amount" ? value : next.subtotal_amount || 0);
        const vat = Number(field === "vat_amount" ? value : next.vat_amount || 0);
        next.total_amount = Number.isFinite(subtotal + vat) ? String(subtotal + vat) : next.total_amount;
      }
      return next;
    });
  };

  const resetContractorForm = () => {
    setContractorForm(blankContractor);
    setEditingContractorId(null);
    setContractorEntryOpen(false);
  };

  const resetInvoiceForm = () => {
    setInvoiceForm(blankInvoice);
    setEditingInvoiceId(null);
    setInvoiceEntryOpen(false);
  };

  const saveContractor = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const wasEditing = Boolean(editingContractorId);
      const payload = {
        ...contractorForm,
        payment_terms_days: Number(contractorForm.payment_terms_days || 0)
      };
      if (wasEditing) {
        await api.contractorInvoices.updateContractor(editingContractorId, payload);
      } else {
        await api.contractorInvoices.createContractor(payload);
      }
      resetContractorForm();
      await load();
      setMessage(wasEditing ? "Contractor updated." : "Contractor saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const editContractor = (contractor) => {
    setEditingContractorId(contractor.id);
    setContractorEntryOpen(true);
    setContractorForm({
      name: contractor.name || "",
      phone: contractor.phone || "",
      email: contractor.email || "",
      tax_pin: contractor.tax_pin || "",
      payment_terms_days: Number(contractor.payment_terms_days ?? 30),
      status: contractor.status || "active",
      notes: contractor.notes || ""
    });
  };

  const toggleContractorStatus = async (contractor) => {
    setMessage("");
    setSaving(true);
    try {
      await api.contractorInvoices.updateContractor(contractor.id, {
        name: contractor.name,
        phone: contractor.phone,
        email: contractor.email,
        tax_pin: contractor.tax_pin,
        payment_terms_days: Number(contractor.payment_terms_days || 0),
        status: contractor.status === "active" ? "inactive" : "active",
        notes: contractor.notes
      });
      await load();
      setMessage(contractor.status === "active" ? "Contractor deactivated." : "Contractor reactivated.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveInvoice = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const wasEditing = Boolean(editingInvoiceId);
      const payload = {
        ...invoiceForm,
        contractor_id: Number(invoiceForm.contractor_id),
        subtotal_amount: Number(invoiceForm.subtotal_amount),
        vat_amount: Number(invoiceForm.vat_amount || 0),
        total_amount: Number(invoiceForm.total_amount || 0)
      };
      if (wasEditing) {
        await api.contractorInvoices.updateInvoice(editingInvoiceId, payload);
      } else {
        await api.contractorInvoices.createInvoice(payload);
      }
      resetInvoiceForm();
      await load();
      setMessage(wasEditing ? "Contractor invoice updated." : "Contractor invoice captured.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const editInvoice = (invoice) => {
    setActiveDocumentInvoiceId(null);
    setActivePostInvoiceId(null);
    setEditingInvoiceId(invoice.id);
    setInvoiceEntryOpen(true);
    setInvoiceForm({
      contractor_id: String(invoice.contractor_id || ""),
      invoice_number: invoice.invoice_number || "",
      invoice_date: date(invoice.invoice_date),
      due_date: date(invoice.due_date),
      category: invoice.category || "Contractor services",
      description: invoice.description || "",
      subtotal_amount: String(invoice.subtotal_amount || ""),
      vat_amount: String(invoice.vat_amount || "0"),
      total_amount: String(invoice.total_amount || ""),
      status: invoice.status === "draft" ? "draft" : "submitted",
      notes: invoice.notes || ""
    });
  };

  const updateStatus = async (invoice, status, reason = "") => {
    setMessage("");
    setSaving(true);
    try {
      await api.contractorInvoices.updateStatus(invoice.id, { status, reason });
      await load();
      setMessage(`Invoice ${label(status)}.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const requestInvoiceReview = (invoice, status) => {
    setInvoiceReview({ kind: "status", invoice, status });
  };

  const requestExpenseReview = (invoice) => {
    const draft = postDrafts[invoice.id] || blankPostDraft;
    setInvoiceReview({ kind: "expense", invoice, draft });
  };

  const closeInvoiceReview = () => {
    if (!invoiceReviewBusy) setInvoiceReview(null);
  };

  const confirmInvoiceReview = async (reviewNotes) => {
    if (!invoiceReview) return;
    const { invoice } = invoiceReview;
    setMessage("");
    setInvoiceReviewBusy(true);
    setSaving(true);
    try {
      if (invoiceReview.kind === "status") {
        await api.contractorInvoices.updateStatus(invoice.id, {
          status: invoiceReview.status,
          reason: reviewNotes
        });
        setMessage(`Invoice ${label(invoiceReview.status)}.`);
      } else {
        await api.contractorInvoices.postExpense(invoice.id, {
          ...invoiceReview.draft,
          review_notes: reviewNotes
        });
        setActivePostInvoiceId(null);
        setMessage("Invoice posted to expenses.");
      }
      await load();
      setInvoiceReview(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
      setInvoiceReviewBusy(false);
    }
  };

  const openPostForm = (invoice) => {
    setActiveDocumentInvoiceId(null);
    setActivePostInvoiceId(invoice.id);
    setPostDrafts((current) => ({
      ...current,
      [invoice.id]: current[invoice.id] || {
        ...blankPostDraft,
        expense_date: invoice.invoice_date?.slice(0, 10) || today(),
        notes: `Contractor invoice ${invoice.invoice_number}`
      }
    }));
  };

  const setPostField = (invoiceId, field, value) => {
    setPostDrafts((current) => ({
      ...current,
      [invoiceId]: {
        ...blankPostDraft,
        ...(current[invoiceId] || {}),
        [field]: value
      }
    }));
  };

  const postToExpense = (event, invoice) => {
    event.preventDefault();
    requestExpenseReview(invoice);
  };

  if (initialLoading) {
    return <WorkspaceState title="Preparing supplier payables" detail="Retrieving contractor records, supplier invoices, and approved-cost controls." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Supplier payables could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }

  return (
    <section className="page-stack contractor-control-page">
      <header className="page-header contractor-control-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Supplier payables</h2>
          <p>Keep supplier commitments visible, approve the right invoices, and post verified costs into the ledger.</p>
        </div>
        <div className="contractor-control-context">
          <span>Open exposure</span>
          <strong>{money(totals.openAmount)}</strong>
        </div>
      </header>

      <div className="stat-grid contractor-control-metrics">
        <div className="stat-card">
          <span>Open invoices</span>
          <strong>{totals.open}</strong>
          <small>{money(totals.openAmount)}</small>
        </div>
        <div className="stat-card">
          <span>Overdue</span>
          <strong>{totals.overdue}</strong>
          <small>{money(totals.overdueAmount)}</small>
        </div>
        <div className="stat-card">
          <span>Due 14 days</span>
          <strong>{totals.dueSoon}</strong>
          <small>Open invoices</small>
        </div>
        <div className="stat-card">
          <span>Approved</span>
          <strong>{totals.approved}</strong>
          <small>Ready to post</small>
        </div>
        <div className="stat-card">
          <span>Posted</span>
          <strong>{totals.posted}</strong>
          <small>In expense ledger</small>
        </div>
        <div className="stat-card">
          <span>Contractors</span>
          <strong>{contractors.length}</strong>
          <small>Supplier register</small>
        </div>
      </div>

      <section className={hasSupplierFocus || !canManage ? "page-stack" : "workspace-grid entry-led-workspace contractor-entry-workspace"}>
        {!hasSupplierFocus && canManage ? (
        <>
          <EntryPanel
            actionLabel="Add contractor"
            className="contractor-entry-panel"
            disabled={saving || invoiceReviewBusy}
            icon={<Pencil size={17} />}
            onOpenChange={(open) => (open ? setContractorEntryOpen(true) : resetContractorForm())}
            open={contractorEntryOpen}
            summary={editingContractorId ? "Update supplier identity and payment terms" : "Register a supplier or contractor"}
            title={editingContractorId ? "Edit contractor" : "Contractor entry"}
          >
          <form className="form-grid" onSubmit={saveContractor}>
            <label>
              Name
              <input value={contractorForm.name} onChange={(event) => setContractorField("name", event.target.value)} required />
            </label>
            <label>
              Phone
              <input value={contractorForm.phone} onChange={(event) => setContractorField("phone", event.target.value)} />
            </label>
            <label>
              Email
              <input value={contractorForm.email} onChange={(event) => setContractorField("email", event.target.value)} type="email" />
            </label>
            <label>
              Tax PIN
              <input value={contractorForm.tax_pin} onChange={(event) => setContractorField("tax_pin", event.target.value)} />
            </label>
            <label>
              Payment terms
              <input
                value={contractorForm.payment_terms_days}
                onChange={(event) => setContractorField("payment_terms_days", event.target.value)}
                type="number"
                min="0"
              />
            </label>
            <label>
              Status
              <select value={contractorForm.status} onChange={(event) => setContractorField("status", event.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>
              Notes
              <textarea value={contractorForm.notes} onChange={(event) => setContractorField("notes", event.target.value)} rows="2" />
            </label>
            <div className="row-actions full-span">
              <button className="primary-button" type="submit" disabled={saving}>
                {editingContractorId ? <Save size={17} /> : <Plus size={17} />}
                {editingContractorId ? "Update contractor" : "Save contractor"}
              </button>
              {editingContractorId ? (
                <button type="button" onClick={resetContractorForm} disabled={saving}>
                  <X size={16} />
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          </EntryPanel>

          <EntryPanel
            actionLabel="Capture invoice"
            className="contractor-invoice-entry-panel"
            disabled={saving || invoiceReviewBusy}
            icon={<FileText size={17} />}
            onOpenChange={(open) => (open ? setInvoiceEntryOpen(true) : resetInvoiceForm())}
            open={invoiceEntryOpen}
            summary={editingInvoiceId ? "Update supplier invoice details" : "Capture a supplier liability for review"}
            title={editingInvoiceId ? "Edit supplier invoice" : "Supplier invoice entry"}
          >
          <form className="form-grid" onSubmit={saveInvoice}>
            <label>
              Contractor
              <select value={invoiceForm.contractor_id} onChange={(event) => setInvoiceField("contractor_id", event.target.value)} required>
                <option value="">Select contractor</option>
                {contractors
                  .filter((contractor) => contractor.status === "active" || String(contractor.id) === String(invoiceForm.contractor_id))
                  .map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>
                      {contractor.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Invoice number
              <input value={invoiceForm.invoice_number} onChange={(event) => setInvoiceField("invoice_number", event.target.value)} required />
            </label>
            <label>
              Invoice date
              <input value={invoiceForm.invoice_date} max={today()} onChange={(event) => setInvoiceField("invoice_date", event.target.value)} type="date" required />
            </label>
            <label>
              Due date
              <input value={invoiceForm.due_date} onChange={(event) => setInvoiceField("due_date", event.target.value)} type="date" required />
            </label>
            <label>
              Category
              <input value={invoiceForm.category} onChange={(event) => setInvoiceField("category", event.target.value)} required />
            </label>
            <label>
              Subtotal
              <input value={invoiceForm.subtotal_amount} onChange={(event) => setInvoiceField("subtotal_amount", event.target.value)} type="number" min="0" step="0.01" required />
            </label>
            <label>
              VAT
              <input value={invoiceForm.vat_amount} onChange={(event) => setInvoiceField("vat_amount", event.target.value)} type="number" min="0" step="0.01" />
            </label>
            <label>
              Total
              <input value={invoiceForm.total_amount} onChange={(event) => setInvoiceField("total_amount", event.target.value)} type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              Status
              <select value={invoiceForm.status} onChange={(event) => setInvoiceField("status", event.target.value)} disabled={Boolean(editingInvoiceId)}>
                <option value="submitted">Submitted</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="full-span">
              Description
              <textarea value={invoiceForm.description} onChange={(event) => setInvoiceField("description", event.target.value)} rows="3" required />
            </label>
            <label className="full-span">
              Notes
              <textarea value={invoiceForm.notes} onChange={(event) => setInvoiceField("notes", event.target.value)} rows="2" />
            </label>
            <div className="row-actions full-span">
              <button className="primary-button" type="submit" disabled={saving}>
                {editingInvoiceId ? <Save size={17} /> : <Send size={17} />}
                {editingInvoiceId ? "Update invoice" : "Save invoice"}
              </button>
              {editingInvoiceId ? (
                <button type="button" onClick={resetInvoiceForm} disabled={saving}>
                  <X size={16} />
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          </EntryPanel>
        </>
        ) : null}

        <div className="page-stack">
        <div className="panel wide-panel register-panel contractor-invoice-register-panel">
          <div className="panel-heading">
            <h3>Invoice Register</h3>
          </div>
          {hasSupplierFocus ? (
            <FocusNotice
              title={focusedTitle}
              detail="Showing only the supplier invoices that need this action. Clear focus to return to the full invoice register."
              onClear={onClearNavigationIntent}
            />
          ) : null}
          {!hasSupplierFocus ? (
            <div className="table-toolbar filter-toolbar">
              <label>
                Status
                <select value={invoiceFilters.status} onChange={(event) => setInvoiceFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="posted_to_expense">Posted</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label>
                Contractor
                <select value={invoiceFilters.contractor_id} onChange={(event) => setInvoiceFilters((current) => ({ ...current, contractor_id: event.target.value }))}>
                  <option value="">All contractors</option>
                  {contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>
                      {contractor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due
                <select value={invoiceFilters.due} onChange={(event) => setInvoiceFilters((current) => ({ ...current, due: event.target.value }))}>
                  <option value="all">All due dates</option>
                  <option value="overdue">Overdue</option>
                  <option value="due_soon">Due in 14 days</option>
                </select>
              </label>
            </div>
          ) : null}
          <TableControls table={invoiceTable} label="invoices" placeholder="Search invoices" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Contractor</th>
                  <th>Dates</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Expense</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {invoiceTable.visibleRows.length ? (
                  invoiceTable.visibleRows.map((invoice) => {
                    const postDraft = postDrafts[invoice.id] || blankPostDraft;
                    return (
                      <Fragment key={invoice.id}>
                        <tr>
                          {canManage ? <td>
                            <strong>{invoice.invoice_number}</strong>
                            <small>{invoice.description}</small>
                            <small>{invoice.document_count ? `${invoice.document_count} document(s)` : "No documents"}</small>
                          </td> : null}
                          <td>
                            {invoice.contractor_name}
                            <small>{invoice.contractor_tax_pin || "-"}</small>
                          </td>
                          <td>
                            <span>{date(invoice.invoice_date)}</span>
                            <small>Due {date(invoice.due_date)}</small>
                          </td>
                          <td>
                            <strong>{money(invoice.total_amount)}</strong>
                            <small>VAT {money(invoice.vat_amount)}</small>
                          </td>
                          <td>
                            <StatusBadge status={invoice.status} />
                          </td>
                          <td>
                            {invoice.expense_id ? `Expense #${invoice.expense_id}` : "-"}
                            {invoice.expense_date ? <small>{date(invoice.expense_date)}</small> : null}
                          </td>
                          <td>
                            <div className="row-actions">
                              {!["posted_to_expense", "paid"].includes(invoice.status) ? (
                                <>
                                  {invoice.status === "draft" ? (
                                    <button type="button" onClick={() => updateStatus(invoice, "submitted")} disabled={saving}>
                                      <Send size={16} />
                                      Submit
                                    </button>
                                  ) : null}
                                  {["submitted", "rejected"].includes(invoice.status) ? (
                                    <button type="button" onClick={() => requestInvoiceReview(invoice, "approved")} disabled={saving}>
                                      <CheckCircle2 size={16} />
                                      Approve
                                    </button>
                                  ) : null}
                                  {invoice.status === "approved" ? (
                                    <button type="button" onClick={() => openPostForm(invoice)} disabled={saving}>
                                      <Banknote size={16} />
                                      Post expense
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                              <details className="table-row-more">
                                <summary aria-label={`More actions for ${invoice.invoice_number}`} title="More invoice actions">
                                  <MoreHorizontal size={18} />
                                </summary>
                                <div className="table-row-more-menu">
                                  <button
                                    aria-label="Supporting documents"
                                    type="button"
                                    onClick={() => {
                                      setActivePostInvoiceId(null);
                                      setActiveDocumentInvoiceId((current) => (current === invoice.id ? null : invoice.id));
                                    }}
                                    disabled={saving}
                                  >
                                    <FileText size={16} />
                                    Supporting documents
                                  </button>
                                  {! ["posted_to_expense", "paid"].includes(invoice.status) ? (
                                    <button aria-label="Edit invoice" type="button" onClick={() => editInvoice(invoice)} disabled={saving || hasSupplierFocus}>
                                      <Pencil size={16} />
                                      Edit invoice
                                    </button>
                                  ) : null}
                                  {["draft", "submitted"].includes(invoice.status) ? (
                                    <button aria-label="Reject invoice" type="button" onClick={() => requestInvoiceReview(invoice, "rejected")} disabled={saving}>
                                      <XCircle size={16} />
                                      Reject invoice
                                    </button>
                                  ) : null}
                                  {invoice.status === "draft" ? (
                                    <button aria-label="Approve without submitting" type="button" onClick={() => requestInvoiceReview(invoice, "approved")} disabled={saving}>
                                      <CheckCircle2 size={16} />
                                      Approve without submitting
                                    </button>
                                  ) : null}
                                </div>
                              </details>
                            </div>
                          </td>
                        </tr>
                        {canManage && activeDocumentInvoiceId === invoice.id ? (
                          <tr>
                            <td colSpan="7">
                              <SupportingDocumentsPanel entityType="contractor_invoice" entityId={invoice.id} />
                            </td>
                          </tr>
                        ) : null}
                        {canManage && activePostInvoiceId === invoice.id ? (
                          <tr>
                            <td colSpan="7">
                              <form className="maintenance-expense-form" onSubmit={(event) => postToExpense(event, invoice)}>
                                <label>
                                  Expense date
                                  <input value={postDraft.expense_date} onChange={(event) => setPostField(invoice.id, "expense_date", event.target.value)} type="date" required />
                                </label>
                                <label>
                                  Channel
                                  <select value={postDraft.payment_channel} onChange={(event) => setPostField(invoice.id, "payment_channel", event.target.value)}>
                                    <option value="manual_adjustment">Manual adjustment</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank</option>
                                    <option value="mpesa_paybill">M-Pesa/paybill</option>
                                  </select>
                                </label>
                                <label>
                                  Receipt number
                                  <input value={postDraft.receipt_number} onChange={(event) => setPostField(invoice.id, "receipt_number", event.target.value)} />
                                </label>
                                <label className="full-span">
                                  Notes
                                  <textarea value={postDraft.notes} onChange={(event) => setPostField(invoice.id, "notes", event.target.value)} rows="2" />
                                </label>
                                <div className="row-actions full-span">
                                  <button className="primary-button" type="submit" disabled={saving}>
                                    <Banknote size={16} />
                                    Post expense
                                  </button>
                                  <button type="button" onClick={() => setActivePostInvoiceId(null)} disabled={saving}>
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <EmptyTableRow colSpan={canManage ? 7 : 6} title="No contractor invoices found" detail="Capture invoices from contractors or suppliers." />
                )}
              </tbody>
            </table>
          </div>
        </div>

        {!hasSupplierFocus ? (
          <div className="panel wide-panel register-panel contractor-register-panel">
            <div className="panel-heading">
              <h3>Contractor Register</h3>
            </div>
            <div className="table-wrap compact-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    {canManage ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {contractors.length ? (
                    contractors.map((contractor) => (
                      <tr key={contractor.id}>
                        {canManage ? <td>
                          <strong>{contractor.name}</strong>
                          <small>{contractor.open_invoice_count || 0} open invoices</small>
                        </td> : null}
                        <td>
                          <StatusBadge status={contractor.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button" type="button" onClick={() => editContractor(contractor)} title="Edit contractor" disabled={saving}>
                              <Pencil size={16} />
                            </button>
                            <button className="icon-button" type="button" onClick={() => toggleContractorStatus(contractor)} title={contractor.status === "active" ? "Deactivate contractor" : "Reactivate contractor"} disabled={saving}>
                              {contractor.status === "active" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={canManage ? 3 : 2} title="No contractors found" detail="Save contractors before capturing supplier invoices." />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        </div>
      <ReviewDialog
        open={Boolean(invoiceReview)}
        eyebrow="Supplier invoice review"
        title={
          invoiceReview?.kind === "expense"
            ? "Post approved invoice to expenses"
            : invoiceReview?.status === "approved"
              ? "Approve supplier invoice"
              : "Reject supplier invoice"
        }
        description={
          invoiceReview?.kind === "expense"
            ? "This creates one linked operating expense and marks the approved supplier invoice as posted. It does not record a supplier payment."
            : invoiceReview?.status === "approved"
              ? "Approval makes this supplier invoice eligible for a separate, reviewed expense posting. It does not create an expense or payment yet."
              : "Rejection leaves this supplier invoice unposted and prevents it from being posted to expenses until it is approved."
        }
        confirmLabel={invoiceReview?.kind === "expense" ? "Post expense" : invoiceReview?.status === "approved" ? "Approve invoice" : "Reject invoice"}
        cancelLabel={invoiceReview?.kind === "expense" ? "Keep approved" : "Keep unchanged"}
        reasonLabel={invoiceReview?.kind === "expense" ? "Posting approval note" : invoiceReview?.status === "approved" ? "Approval note" : "Rejection note"}
        reasonPlaceholder="State the evidence or decision basis for the audit trail"
        busy={invoiceReviewBusy}
        busyLabel={invoiceReview?.kind === "expense" ? "Posting expense..." : "Saving review..."}
        danger={invoiceReview?.status === "rejected"}
        onCancel={closeInvoiceReview}
        onConfirm={confirmInvoiceReview}
      >
        {invoiceReview ? (
          <div className="reading-context">
            <div><span>Supplier</span><strong>{invoiceReview.invoice.contractor_name}</strong></div>
            <div><span>Invoice</span><strong>{invoiceReview.invoice.invoice_number}</strong></div>
            <div><span>Amount</span><strong>{money(invoiceReview.invoice.total_amount)}</strong></div>
            <div><span>Due date</span><strong>{date(invoiceReview.invoice.due_date)}</strong></div>
            {invoiceReview.kind === "expense" ? <>
              <div><span>Expense date</span><strong>{date(invoiceReview.draft.expense_date)}</strong></div>
              <div><span>Channel</span><strong>{label(invoiceReview.draft.payment_channel)}</strong></div>
              <div><span>Receipt number</span><strong>{invoiceReview.draft.receipt_number || "Not recorded"}</strong></div>
            </> : null}
          </div>
        ) : null}
      </ReviewDialog>
      </section>
    </section>
  );
}

export default ContractorInvoicesPage;
