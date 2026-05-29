import { LockKeyhole, LogOut, Save } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";

function PasswordChangePage({ user, onChanged, onLogout }) {
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    const categories = [
      /[a-z]/.test(form.new_password),
      /[A-Z]/.test(form.new_password),
      /\d/.test(form.new_password),
      /[^A-Za-z0-9]/.test(form.new_password)
    ].filter(Boolean).length;

    if (form.new_password.length < 8 || categories < 3) {
      setMessage("New password must be at least 8 characters and include three of uppercase, lowercase, numbers, and symbols.");
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setMessage("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      const result = await api.changePassword(form.current_password, form.new_password);
      onChanged(result.user);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-panel form-grid" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">
            <LockKeyhole size={18} />
          </span>
          <div>
            <h1>Update Password</h1>
            <p className="muted">{user?.name || user?.email}</p>
          </div>
        </div>

        <label>
          Temporary password
          <input
            value={form.current_password}
            onChange={(event) => setField("current_password", event.target.value)}
            type="password"
            required
          />
        </label>
        <label>
          New password
          <input
            value={form.new_password}
            onChange={(event) => setField("new_password", event.target.value)}
            type="password"
            autoComplete="new-password"
            minLength="8"
            required
          />
          <small>Use at least 8 characters with three of uppercase, lowercase, numbers, and symbols.</small>
        </label>
        <label>
          Confirm new password
          <input
            value={form.confirm_password}
            onChange={(event) => setField("confirm_password", event.target.value)}
            type="password"
            minLength="8"
            required
          />
        </label>

        {message ? <p className="form-error">{message}</p> : null}

        <button className="primary-button" type="submit" disabled={saving}>
          <Save size={17} />
          {saving ? "Saving..." : "Save password"}
        </button>
        <button className="icon-button secondary-wide-button" type="button" onClick={() => onLogout()}>
          <LogOut size={16} />
          Sign out
        </button>
      </form>
    </main>
  );
}

export default PasswordChangePage;
