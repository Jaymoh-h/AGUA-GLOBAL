import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "meter_reader",
    customer_id: "",
    password: ""
  });
  const [message, setMessage] = useState("");

  const load = async () => {
    const [userRows, customerRows] = await Promise.all([api.users.list(), api.customers.list()]);
    setUsers(userRows);
    setCustomers(customerRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.users.create({
        ...form,
        customer_id: form.role === "customer" && form.customer_id ? Number(form.customer_id) : null
      });
      setForm({ name: "", email: "", phone: "", role: "meter_reader", customer_id: "", password: "" });
      await load();
      setMessage("User created.");
    } catch (err) {
      setMessage(err.message);
    }
  };

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
            <h3>Create User</h3>
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
              <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)}>
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
            Temporary password
            <input value={form.password} onChange={(event) => setField("password", event.target.value)} type="password" required />
          </label>
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit">
            <UserPlus size={17} />
            Create user
          </button>
        </form>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>User Accounts</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Customer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role.replace("_", " ")}</td>
                    <td>{user.customer_acc_number || "-"}</td>
                    <td>{user.is_active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

export default UsersPage;

