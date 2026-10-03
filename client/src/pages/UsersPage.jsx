import { Edit3, Link2, RotateCcw, Save, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EntryPanel from "../components/EntryPanel";
import { EmptyTableRow } from "../components/EmptyState";
import ReviewDialog from "../components/ReviewDialog";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";

const blank = {
  name: "",
  email: "",
  phone: "",
  role: "meter_reader",
  customer_id: "",
  linked_customer_ids: [],
  password: "",
  is_active: true
};

const blankAccessProfile = {
  label: "",
  role: "business_viewer",
  customer_id: "",
  is_active: true
};

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "meter_reader", label: "Meter reader" },
  { value: "accountant", label: "Accountant" },
  { value: "business_viewer", label: "Business viewer" },
  { value: "customer", label: "Customer/client" }
];

const formatDateTime = (value) => {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
};

const customerLabel = (customer) => `${customer.acc_number} - ${customer.name}`;
const roleLabel = (role) => roleOptions.find((option) => option.value === role)?.label || String(role || "").replace("_", " ");

function UsersPage({ user: currentUser }) {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [form, setForm] = useState(blank);
  const [accessForm, setAccessForm] = useState(blankAccessProfile);
  const [editingId, setEditingId] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [accessReview, setAccessReview] = useState(null);
  const [accessReviewBusy, setAccessReviewBusy] = useState(false);
  const [statusReview, setStatusReview] = useState(null);
  const [statusReviewBusy, setStatusReviewBusy] = useState(false);
  const [profileReview, setProfileReview] = useState(null);
  const [profileReviewBusy, setProfileReviewBusy] = useState(false);
  const [detachReview, setDetachReview] = useState(null);
  const [detachBusy, setDetachBusy] = useState(false);
  const [, setMessage] = useToastMessage();

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const [userRows, customerRows] = await Promise.all([api.users.list(), api.customers.list()]);
      setUsers(userRows);
      setCustomers(customerRows);
    } catch (err) {
      if (showState) setInitialError(err.message || "User access records could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEntryOpen(false);
    setForm(blank);
    setAccessForm(blankAccessProfile);
    setMessage("");
  };

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "role" && value !== "customer" ? { customer_id: "", linked_customer_ids: [] } : {}),
      ...(field === "customer_id" && value
        ? { linked_customer_ids: [...new Set([...current.linked_customer_ids, Number(value)])] }
        : {})
    }));
  };

  const setAccessField = (field, value) => {
    setAccessForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "role" && value !== "customer" ? { customer_id: "" } : {})
    }));
  };

  const toggleLinkedCustomer = (customerId) => {
    const id = Number(customerId);
    setForm((current) => {
      const linked = current.linked_customer_ids.includes(id)
        ? current.linked_customer_ids.filter((linkedId) => linkedId !== id)
        : [...current.linked_customer_ids, id];
      const nextPrimary = linked.includes(Number(current.customer_id)) ? current.customer_id : linked[0] || "";
      return {
        ...current,
        linked_customer_ids: linked,
        customer_id: nextPrimary
      };
    });
  };

  const edit = (account) => {
    setEditingId(account.id);
    setEntryOpen(true);
    setForm({
      name: account.name || "",
      email: account.email || "",
      phone: account.phone || "",
      role: account.role || "meter_reader",
      customer_id: account.customer_id || "",
      linked_customer_ids: (account.linked_customers || []).map((customer) => Number(customer.id)),
      password: "",
      is_active: Boolean(account.is_active)
    });
    setAccessForm(blankAccessProfile);
    setMessage("");
  };

  const submit = (event) => {
    event.preventDefault();
    setMessage("");

    if (!editingId && !form.password) {
      setMessage("Temporary password is required when creating an account.");
      return;
    }

    const payload = {
        ...form,
        customer_id: form.role === "customer" && form.customer_id ? Number(form.customer_id) : null,
        linked_customer_ids:
          form.role === "customer" ? [...new Set([Number(form.customer_id), ...form.linked_customer_ids].filter(Boolean))] : []
      };
      if (!payload.password) {
        delete payload.password;
      }

    setAccessReview({ action: editingId ? "update" : "create", payload, account: selectedUser });
  };

  const confirmAccessReview = async (reviewNotes) => {
    if (!accessReview) return;
    setAccessReviewBusy(true);
    try {
      if (accessReview.action === "update") await api.users.update(editingId, { ...accessReview.payload, review_notes: reviewNotes });
      else await api.users.create({ ...accessReview.payload, review_notes: reviewNotes });
      resetForm();
      await load();
      setMessage(accessReview.action === "update" ? "User account updated." : "User account created.");
      setAccessReview(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setAccessReviewBusy(false);
    }
  };

  const toggleStatus = (account) => {
    setStatusReview(account);
  };

  const confirmStatusReview = async (reviewNotes) => {
    if (!statusReview) return;
    setMessage("");
    setStatusReviewBusy(true);
    try {
      await api.users.update(statusReview.id, { is_active: !statusReview.is_active, review_notes: reviewNotes });
      await load();
      setStatusReview(null);
      setMessage(statusReview.is_active ? "Account locked." : "Account unlocked.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setStatusReviewBusy(false);
    }
  };

  const selectedUser = users.find((account) => Number(account.id) === Number(editingId));

  const submitAccessProfile = () => {
    if (!editingId) return;
    setMessage("");
    setProfileReview({
      action: "create",
      payload: {
        ...accessForm,
        customer_id: accessForm.role === "customer" && accessForm.customer_id ? Number(accessForm.customer_id) : null
      }
    });
  };

  const toggleAccessProfile = (profile) => {
    if (!editingId || profile.is_default) return;
    setMessage("");
    setProfileReview({
      action: profile.is_active ? "disable" : "enable",
      profile,
      payload: { is_active: !profile.is_active }
    });
  };

  const confirmProfileReview = async (reviewNotes) => {
    if (!editingId || !profileReview) return;
    setProfileReviewBusy(true);
    try {
      if (profileReview.action === "create") {
        await api.users.createAccessProfile(editingId, { ...profileReview.payload, review_notes: reviewNotes });
        setAccessForm(blankAccessProfile);
      } else {
        await api.users.updateAccessProfile(editingId, profileReview.profile.id, {
          ...profileReview.payload,
          review_notes: reviewNotes
        });
      }
      await load();
      setProfileReview(null);
      setMessage(
        profileReview.action === "create"
          ? "Access context added."
          : profileReview.action === "disable"
            ? "Access context disabled."
            : "Access context enabled."
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setProfileReviewBusy(false);
    }
  };

  const detachAccessProfile = (profile) => {
    if (!editingId || profile.is_default || profile.is_active) return;
    setDetachReview(profile);
  };

  const confirmDetachAccessProfile = async (reviewNotes) => {
    if (!editingId || !detachReview) return;
    setMessage("");
    setDetachBusy(true);
    try {
      await api.users.detachAccessProfile(editingId, detachReview.id, reviewNotes);
      await load();
      setDetachReview(null);
      setMessage("Access context detached.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setDetachBusy(false);
    }
  };
  const userTable = useTableControls(users, {
    searchFields: [
      "name",
      "email",
      "phone",
      "role",
      "customer_acc_number",
      "customer_name",
      "is_active",
      "must_change_password",
      "last_login_at",
      "password_changed_at"
    ]
  });
  const userSummary = useMemo(
    () => ({
      active: users.filter((account) => account.is_active).length,
      inactive: users.filter((account) => !account.is_active).length,
      customers: users.filter((account) => account.role === "customer").length,
      passwordReset: users.filter((account) => account.must_change_password).length,
      noLogin: users.filter((account) => account.is_active && !account.last_login_at).length
    }),
    [users]
  );

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving users and customer-account references." title="Preparing access control" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={() => load({ showState: true }).catch(() => {})}
        state="error"
        title="Access control could not load"
      />
    );
  }

  return (
    <section className="page-stack access-control-page">
      <header className="page-header access-control-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Access control</h2>
          <p>Maintain the people and customer accounts that can operate the system, with role context and account hygiene visible.</p>
        </div>
      </header>

      <section className="access-control-metrics" aria-label="Access overview">
        <div><span>Active accounts</span><strong>{userSummary.active}</strong><small>Can access assigned workspaces</small></div>
        <div className={userSummary.passwordReset ? "needs-attention" : ""}><span>Password changes</span><strong>{userSummary.passwordReset}</strong><small>Users required to update credentials</small></div>
        <div className={userSummary.noLogin ? "needs-attention" : ""}><span>Never signed in</span><strong>{userSummary.noLogin}</strong><small>Active accounts with no login record</small></div>
        <div><span>Portal accounts</span><strong>{userSummary.customers}</strong><small>{userSummary.inactive} inactive account{userSummary.inactive === 1 ? "" : "s"}</small></div>
      </section>

      <section className="workspace-grid entry-led-workspace access-control-workspace">
        <EntryPanel
          actionLabel="Create user"
          className="user-entry-panel"
          disabled={accessReviewBusy || Boolean(accessReview)}
          icon={<UserPlus size={17} />}
          onOpenChange={(open) => (open ? setEntryOpen(true) : resetForm())}
          open={entryOpen}
          summary={editingId ? "Update identity, access, or portal context" : "Set up an operator or customer account"}
          title={editingId ? "Edit user account" : "User account entry"}
        >
        <form className="form-grid" onSubmit={submit}>
          {editingId ? (
            <div className="entry-form-context">
              <span>Editing {selectedUser?.name || "selected user"}</span>
              <button className="icon-button" type="button" onClick={resetForm} title="Cancel editing">
                <RotateCcw size={16} />
              </button>
            </div>
          ) : null}
          <label>
            Name
            <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
          </label>
          <label>
            Email
            <input value={form.email} onChange={(event) => setField("email", event.target.value)} type="email" required />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setField("role", event.target.value)}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {form.role === "customer" ? (
            <label>
              Linked customer
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {form.role === "customer" ? (
            <div className="linked-account-picker">
              <div className="panel-heading compact-heading">
                <h4>Portal Accounts</h4>
                <Link2 size={16} />
              </div>
              <div className="linked-account-list">
                {customers.map((customer) => {
                  const checked = form.linked_customer_ids.includes(Number(customer.id));
                  const primary = Number(form.customer_id) === Number(customer.id);
                  return (
                    <label key={customer.id} className="linked-account-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLinkedCustomer(customer.id)}
                      />
                      <span>
                        <strong>{customer.acc_number}</strong>
                        <small>{customer.name}</small>
                      </span>
                      {primary ? <em>Primary</em> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          <label>
            {editingId ? "Reset temporary password" : "Temporary password"}
            <input
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              type="password"
              autoComplete="new-password"
              required={!editingId}
            />
            <small>Use at least 8 characters with three of uppercase, lowercase, numbers, and symbols.</small>
          </label>
          <label className="checkbox-row">
            <input
              checked={Boolean(form.is_active)}
              onChange={(event) => setField("is_active", event.target.checked)}
              type="checkbox"
              disabled={Number(editingId) === Number(currentUser.id)}
            />
            Account active
          </label>
          <button className="primary-button" type="submit" disabled={accessReviewBusy || Boolean(accessReview)}>
            {editingId ? <Save size={17} /> : <UserPlus size={17} />}
            {editingId ? "Save changes" : "Create user"}
          </button>
          {selectedUser ? (
            <div className="access-profile-panel">
              <div className="panel-heading compact-heading">
                <h4>Access Contexts</h4>
                <Link2 size={16} />
              </div>
              <div className="linked-account-list">
                {(selectedUser.access_profiles || []).map((profile) => {
                  const canDetachProfile =
                    !profile.is_default && !profile.is_active && (selectedUser.access_profiles || []).length > 1;
                  return (
                  <div key={profile.id} className="linked-account-option access-profile-row">
                    <span>
                      <strong>{profile.label || roleLabel(profile.role)}</strong>
                      <small>
                        {roleLabel(profile.role)}
                        {profile.customer_acc_number ? ` - ${profile.customer_acc_number} ${profile.customer_name || ""}` : ""}
                      </small>
                    </span>
                    {profile.is_default ? <em>Default</em> : null}
                    <button
                      type="button"
                      onClick={() => toggleAccessProfile(profile)}
                      disabled={profile.is_default}
                    >
                      {profile.is_active ? "Disable" : "Enable"}
                    </button>
                    {canDetachProfile ? (
                      <button type="button" onClick={() => detachAccessProfile(profile)}>
                        Detach
                      </button>
                    ) : null}
                  </div>
                );
                })}
              </div>
              <div className="divider-line" />
              <div className="form-grid compact-form">
                <label>
                  Context label
                  <input
                    value={accessForm.label}
                    onChange={(event) => setAccessField("label", event.target.value)}
                    placeholder="Director view, customer portal..."
                  />
                </label>
                <label>
                  Role
                  <select value={accessForm.role} onChange={(event) => setAccessField("role", event.target.value)}>
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {accessForm.role === "customer" ? (
                  <label>
                    Customer account
                    <select value={accessForm.customer_id} onChange={(event) => setAccessField("customer_id", event.target.value)} required>
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customerLabel(customer)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="secondary-wide-button" type="button" onClick={submitAccessProfile} disabled={profileReviewBusy || Boolean(profileReview)}>
                  Add access context
                </button>
              </div>
            </div>
          ) : null}
        </form>
        </EntryPanel>

        <div className="panel wide-panel register-panel user-register-panel">
          <div className="panel-heading">
            <h3>User Accounts</h3>
          </div>
          <TableControls table={userTable} label="users" placeholder="Search users" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Customer</th>
                  <th>Password</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userTable.visibleRows.length ? (
                  userTable.visibleRows.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.name}</strong>
                        <small>{account.phone || "-"}</small>
                      </td>
                      <td className="user-email-cell">{account.email}</td>
                      <td>
                        {roleLabel(account.role)}
                        <small>
                          {(account.access_profiles || []).length} access context
                          {(account.access_profiles || []).length === 1 ? "" : "s"}
                        </small>
                      </td>
                      <td>
                        <strong>{account.customer_acc_number || "-"}</strong>
                        <small>{account.customer_name || ""}</small>
                        {account.role === "customer" ? (
                          <small>
                            {(account.linked_customers || []).length} linked account
                            {(account.linked_customers || []).length === 1 ? "" : "s"}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <span className={`status ${account.must_change_password ? "status-high" : "status-valid"}`}>
                          {account.must_change_password ? "Temporary" : "Set"}
                        </span>
                        <small>Changed: {formatDateTime(account.password_changed_at)}</small>
                      </td>
                      <td>{formatDateTime(account.last_login_at)}</td>
                      <td>
                        <span className={`status ${account.is_active ? "status-valid" : "status-locked"}`}>
                          {account.is_active ? "Active" : "Locked"}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button type="button" onClick={() => edit(account)}>
                          <Edit3 size={15} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(account)}
                          disabled={Number(account.id) === Number(currentUser.id)}
                        >
                          {account.is_active ? "Lock" : "Unlock"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={8} title="No users found" detail="Create a user or adjust the search." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <ReviewDialog
        open={Boolean(profileReview)}
        eyebrow="Access-context review"
        title={
          profileReview?.action === "create"
            ? "Add access context"
            : profileReview?.action === "disable"
              ? "Disable access context"
              : "Enable access context"
        }
        description={
          profileReview?.action === "create"
            ? "This grants an additional role or customer-portal scope to the selected user. The account can switch to it after the next sign-in or context refresh."
            : profileReview?.action === "disable"
              ? "This removes the selected context from sign-in and workspace switching without deleting its audit history."
              : "This restores the selected context for sign-in and workspace switching under its existing role and customer scope."
        }
        confirmLabel={
          profileReview?.action === "create"
            ? "Add access context"
            : profileReview?.action === "disable"
              ? "Disable access context"
              : "Enable access context"
        }
        cancelLabel="Keep current access"
        reasonLabel="Access-context approval note"
        reasonPlaceholder="Record the approved role, scope, and authority for this access-context change"
        busy={profileReviewBusy}
        danger={profileReview?.action === "disable"}
        onCancel={() => !profileReviewBusy && setProfileReview(null)}
        onConfirm={confirmProfileReview}
      >
        {profileReview ? <div className="reading-context">
          <div><span>User</span><strong>{selectedUser?.name || "Selected user"}</strong></div>
          <div><span>Access context</span><strong>{profileReview.payload.label || profileReview.profile?.label || roleLabel(profileReview.payload.role || profileReview.profile?.role)}</strong></div>
          <div><span>Role</span><strong>{roleLabel(profileReview.payload.role || profileReview.profile?.role)}</strong></div>
          <div><span>Customer scope</span><strong>{profileReview.payload.customer_id ? customerLabel(customers.find((customer) => Number(customer.id) === Number(profileReview.payload.customer_id)) || { acc_number: "Unknown", name: "customer" }) : profileReview.profile?.customer_acc_number ? `${profileReview.profile.customer_acc_number} - ${profileReview.profile.customer_name || "Customer"}` : "Staff workspace only"}</strong></div>
          <div><span>Result after confirmation</span><strong>{profileReview.action === "create" ? "Additional context available" : profileReview.action === "disable" ? "Context unavailable for sign-in" : "Context available under existing scope"}</strong></div>
        </div> : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(statusReview)}
        eyebrow="Access status review"
        title={statusReview?.is_active ? "Lock user account" : "Unlock user account"}
        description={statusReview?.is_active ? "This prevents the user from signing in or operating assigned workflows. It does not delete the account, access history, or audit record." : "This restores sign-in access under the user's existing role and access scope. It does not reset the password or send a notification."}
        confirmLabel={statusReview?.is_active ? "Lock user account" : "Unlock user account"}
        cancelLabel="Keep current status"
        reasonLabel="Access-status approval note"
        reasonPlaceholder="Record the authority and reason for changing this account's sign-in access"
        busy={statusReviewBusy}
        danger={Boolean(statusReview?.is_active)}
        onCancel={() => !statusReviewBusy && setStatusReview(null)}
        onConfirm={confirmStatusReview}
      >
        {statusReview ? <div className="reading-context">
          <div><span>User</span><strong>{statusReview.name} | {statusReview.email}</strong></div>
          <div><span>Current status</span><strong>{statusReview.is_active ? "Active" : "Locked"}</strong></div>
          <div><span>Result after confirmation</span><strong>{statusReview.is_active ? "Locked from sign-in" : "Active under existing access scope"}</strong></div>
          <div><span>Credential consequence</span><strong>No password reset or notification</strong></div>
        </div> : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(accessReview)}
        eyebrow="Access-control review"
        title={accessReview?.action === "create" ? "Create user account" : "Save user access changes"}
        description={accessReview?.action === "create" ? "This creates an account with the selected role and access scope. The temporary password requires a change at first sign-in; no notification is sent by this action." : "This changes the selected user's role, account status, customer scope, contact details, or temporary password. Existing last-admin protections remain in force."}
        confirmLabel={accessReview?.action === "create" ? "Create user account" : "Save user access changes"}
        cancelLabel="Keep editing"
        reasonLabel="Access approval note"
        reasonPlaceholder="Record the approved access level, scope, and authority"
        busy={accessReviewBusy}
        onCancel={() => !accessReviewBusy && setAccessReview(null)}
        onConfirm={confirmAccessReview}
      >
        {accessReview ? <div className="reading-context">
          <div><span>User</span><strong>{accessReview.payload.name} | {accessReview.payload.email}</strong></div>
          <div><span>Role</span><strong>{roleLabel(accessReview.payload.role)}</strong></div>
          <div><span>Account status</span><strong>{accessReview.payload.is_active ? "Active" : "Locked"}</strong></div>
          <div><span>Credential consequence</span><strong>{accessReview.payload.password ? "Temporary password reset required at first sign-in" : "No password reset"}</strong></div>
          <div><span>Notifications</span><strong>None sent by this action</strong></div>
        </div> : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(detachReview)}
        eyebrow="User access"
        title="Detach access context"
        description={
          detachReview
            ? `Remove "${detachReview.label || roleLabel(detachReview.role)}" from ${selectedUser?.name || "this user"}. This context must be added again before it can be used.`
            : ""
        }
        confirmLabel="Detach context"
        cancelLabel="Keep access context"
        reasonLabel="Access-context removal note"
        reasonPlaceholder="Record the authority and reason for removing this disabled access context"
        busy={detachBusy}
        danger
        onCancel={() => !detachBusy && setDetachReview(null)}
        onConfirm={confirmDetachAccessProfile}
      >
        {detachReview ? <div className="reading-context">
          <div><span>User</span><strong>{selectedUser?.name || "Selected user"}</strong></div>
          <div><span>Access context</span><strong>{detachReview.label || roleLabel(detachReview.role)}</strong></div>
          <div><span>Current state</span><strong>Disabled and unavailable for sign-in</strong></div>
          <div><span>Result after confirmation</span><strong>Removed from this account permanently</strong></div>
        </div> : null}
      </ReviewDialog>
    </section>
  );
}

export default UsersPage;
