import { Droplets, LockKeyhole, Mail, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";

const passwordIsStrong = (password) => {
  const categories = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ].filter(Boolean).length;
  return password.length >= 8 && categories >= 3;
};

function LoginPage({ appName, onLogin, sessionMessage = "", variant = "page" }) {
  const resetToken = new URLSearchParams(window.location.search).get("reset_token") || "";
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(sessionMessage);
  const [loading, setLoading] = useState(false);
  const [contextSelection, setContextSelection] = useState(null);

  const roleLabel = (role) => String(role || "").replace("_", " ");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const data = await api.login(email, password);
      if (data.requires_context_selection) {
        setContextSelection(data);
        setPassword("");
        return;
      }
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectContext = async (profileId) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await api.selectContext(contextSelection.context_selection_token, profileId);
      onLogin(data);
    } catch (err) {
      setError(err.message);
      setContextSelection(null);
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await api.requestPasswordReset(email);
      setNotice(result.message);
      setMode("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!passwordIsStrong(newPassword)) {
      setError("New password must be at least 8 characters and include three of uppercase, lowercase, numbers, and symbols.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.resetPassword(resetToken, newPassword);
      window.history.replaceState({}, "", window.location.pathname);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const panel = (
    <section className={`login-panel ${variant === "modal" ? "login-panel-modal" : ""}`} aria-label="Login form">
        <div className="login-brand">
          <span className="brand-mark">
            <Droplets size={24} />
          </span>
          <div>
            <h1>{appName}</h1>
            <p>Water billing and customer management</p>
          </div>
        </div>

        {notice ? <p className="form-note">{notice}</p> : null}

        {mode === "reset" ? (
          <form onSubmit={resetPassword} className="form-grid">
            <div className="panel-heading compact-heading">
              <h3>Set New Password</h3>
              <LockKeyhole size={17} />
            </div>
            <label>
              New password
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength="8"
                autoFocus
                required
              />
              <small>Use at least 8 characters with three of uppercase, lowercase, numbers, and symbols.</small>
            </label>
            <label>
              Confirm new password
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength="8"
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        ) : null}

        {mode === "request" ? (
          <form onSubmit={requestReset} className="form-grid">
            <div className="panel-heading compact-heading">
              <h3>Recover Password</h3>
              <Mail size={17} />
            </div>
            <label>
              Registered email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <button className="secondary-wide-button" type="button" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          </form>
        ) : null}

        {mode === "login" && contextSelection ? (
          <div className="form-grid">
            <div className="panel-heading compact-heading">
              <h3>Choose Access</h3>
              <UserRoundCheck size={17} />
            </div>
            <p className="muted">Select where you want to continue as {contextSelection.user?.name || email}.</p>
            <div className="linked-account-list">
              {(contextSelection.contexts || []).map((context) => (
                <button
                  key={context.id}
                  className="linked-account-option context-choice"
                  type="button"
                  onClick={() => selectContext(context.id)}
                  disabled={loading}
                >
                  <span>
                    <strong>{context.label || roleLabel(context.role)}</strong>
                    <small>
                      {context.customer_acc_number
                        ? `${context.customer_acc_number} - ${context.customer_name || "Customer"}`
                        : roleLabel(context.role)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="secondary-wide-button" type="button" onClick={() => setContextSelection(null)}>
              Back to sign in
            </button>
          </div>
        ) : null}

        {mode === "login" && !contextSelection ? (
          <form onSubmit={submit} className="form-grid">
            <label>
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <button className="secondary-wide-button" type="button" onClick={() => setMode("request")}>
              Forgot password?
            </button>
          </form>
        ) : null}
    </section>
  );

  if (variant === "modal") {
    return panel;
  }

  return <main className="login-page">{panel}</main>;
}

export default LoginPage;
