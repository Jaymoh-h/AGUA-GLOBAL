import { Edit3, RotateCcw, Save, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const blank = {
  name: "",
  email: "",
  phone: "",
  role: "meter_reader",
  customer_id: "",
  password: "",
  is_active: true
};

const formatDateTime = (value) => {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
};

function UsersPage({ user: currentUser }) {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [userRows, customerRows] = await Promise.all([api.users.list(), api.customers.list()]);
    setUsers(userRows);
    setCustomers(customerRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(blank);
    setMessage("");
  };

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "role" && value !== "customer" ? { customer_id: "" } : {})
    }));
  };

  const edit = (account) => {
    setEditingId(account.id);
    setForm({
      name: account.name || "",
      email: account.email || "",
      phone: account.phone || "",
      role: account.role || "meter_reader",
      customer_id: account.customer_id || "",
      password: "",
      is_active: Boolean(account.is_active)
    });
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!editingId && !form.password) {
      setMessage("Temporary password is required when creating an account.");
      return;
    }

    try {
      const payload = {
        ...form,
        customer_id: form.role === "customer" && form.customer_id ? Number(form.customer_id) : null
      };
      if (!payload.password) {
        delete payload.password;
      }

      if (editingId) {
        await api.users.update(editingId, payload);
      } else {
        await api.users.create(payload);
      }

      resetForm();
      await load();
      setMessage(editingId ? "User account updated." : "User account created.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const toggleStatus = async (account) => {
    setMessage("");
    try {
      await api.users.update(account.id, { is_active: !account.is_active });
      await load();
      setMessage(account.is_active ? "Account locked." : "Account unlocked.");
    } catch (err) {
      setMessage(err.message);
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

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Users</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit User" : "Create User"}</h3>
            {editingId ? (
              <button className="icon-button" type="button" onClick={resetForm} title="Cancel editing">
                <RotateCcw size={16} />
              </button>
            ) : null}
          </div>
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
              <option value="admin">Admin</option>
              <option value="meter_reader">Meter reader</option>
              <option value="accountant">Accountant</option>
              <option value="customer">Customer/client</option>
            </select>
          </label>
          {form.role === "customer" ? (
            <label>
              Linked customer
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
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
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit">
            {editingId ? <Save size={17} /> : <UserPlus size={17} />}
            {editingId ? "Save changes" : "Create user"}
          </button>
        </form>

        <div className="panel wide-panel">
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
                      <td>{account.email}</td>
                      <td>{account.role.replace("_", " ")}</td>
                      <td>
                        <strong>{account.customer_acc_number || "-"}</strong>
                        <small>{account.customer_name || ""}</small>
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
    </section>
  );
}

export default UsersPage;
