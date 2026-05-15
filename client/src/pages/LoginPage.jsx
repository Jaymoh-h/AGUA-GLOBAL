import { Droplets } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("admin@agua.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api.login(email, password);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="Login form">
        <div className="login-brand">
          <span className="brand-mark">
            <Droplets size={24} />
          </span>
          <div>
            <h1>AGUA Global</h1>
            <p>Water billing and customer management</p>
          </div>
        </div>

        <form onSubmit={submit} className="form-grid">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;

