import { ArrowRight, Droplets, Gauge, Mail, ReceiptText, ShieldCheck, Sparkles, Waves, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LoginPage from "./LoginPage";

const hasResetToken = () => Boolean(new URLSearchParams(window.location.search).get("reset_token"));

function LandingPage({ appName, businessSettings = {}, onLogin, sessionMessage = "" }) {
  const [loginOpen, setLoginOpen] = useState(hasResetToken);
  const canvasRef = useRef(null);
  const email = String(businessSettings.email || "").trim();

  const openLogin = () => setLoginOpen(true);
  const closeLogin = () => {
    if (!hasResetToken()) setLoginOpen(false);
  };

  useEffect(() => {
    if (!loginOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loginOpen]);

  useEffect(() => {
    if (!loginOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeLogin();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loginOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frameId;
    let start = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time) => {
      const elapsed = (time - start) / 1000;
      const { width, height } = canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);

      for (let index = 0; index < 5; index += 1) {
        const offset = elapsed * (26 + index * 5) + index * 84;
        const y = height * (0.68 + index * 0.045);
        context.beginPath();
        for (let x = -60; x <= width + 60; x += 18) {
          const wave = Math.sin((x + offset) / (72 + index * 8)) * (9 + index * 1.8);
          const secondary = Math.sin((x * 0.7 - offset) / 120) * 4;
          const pointY = y + wave + secondary;
          if (x === -60) context.moveTo(x, pointY);
          else context.lineTo(x, pointY);
        }
        context.strokeStyle = `rgba(137, 244, 232, ${0.28 - index * 0.028})`;
        context.lineWidth = 2 + index * 0.55;
        context.stroke();
      }

      const glow = context.createRadialGradient(width * 0.72, height * 0.58, 20, width * 0.72, height * 0.58, width * 0.42);
      glow.addColorStop(0, "rgba(137, 244, 232, 0.24)");
      glow.addColorStop(1, "rgba(137, 244, 232, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      frameId = window.requestAnimationFrame(draw);
    };

    resize();
    frameId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main className="landing-page">
      <section className={`landing-hero ${loginOpen ? "landing-muted" : ""}`}>
        <div className="landing-hero-media" aria-hidden="true">
          <img src="/water-tech-hero.png" alt="" />
          <canvas ref={canvasRef} className="landing-water-canvas" />
          <span className="water-motion water-motion-one" />
          <span className="water-motion water-motion-two" />
        </div>
        <nav className="landing-nav" aria-label="Public navigation">
          <div className="landing-brand">
            <span className="brand-mark">
              <Droplets size={22} />
            </span>
            <strong>{appName}</strong>
          </div>
          <button type="button" className="landing-login-button" onClick={openLogin}>
            Login
            <ArrowRight size={16} />
          </button>
        </nav>

        <div className="landing-hero-content">
          <p className="eyebrow">Modern water service management</p>
          <h1>{appName}</h1>
          <p>
            Clear readings, timely bills, accountable payments, and practical customer support for communities that rely on every drop.
          </p>
          <div className="landing-actions">
            <button type="button" className="landing-primary-action" onClick={openLogin}>
              Access portal
              <ArrowRight size={17} />
            </button>
            <a href="#how-it-works">How billing works</a>
          </div>
        </div>
      </section>

      <section className="landing-band" id="how-it-works">
        <div className="landing-section-heading">
          <p className="eyebrow">How the cycle stays transparent</p>
          <h2>From meter reading to receipt</h2>
        </div>
        <div className="landing-feature-grid">
          <article>
            <Gauge size={24} />
            <h3>Readings are captured</h3>
            <p>Meter readings form the billing base, with review points for corrections, replacements, and source-side billing where needed.</p>
          </article>
          <article>
            <ReceiptText size={24} />
            <h3>Bills are prepared</h3>
            <p>Customers receive clear billing information, including consumption, outstanding balances, due dates, and payment instructions.</p>
          </article>
          <article>
            <ShieldCheck size={24} />
            <h3>Payments are traceable</h3>
            <p>Receipts, allocations, credits, and audit history keep the account position visible to staff and customers.</p>
          </article>
        </div>
      </section>

      <section className="landing-education">
        <div>
          <Waves size={28} />
          <h2>Water data that supports better service</h2>
        </div>
        <p>
          Consistent records help a water business spot high consumption, follow up on arrears, monitor production costs, and keep customers informed
          before small issues become expensive ones.
        </p>
        <div className="landing-metrics" aria-label="Service focus areas">
          <span>Meter accuracy</span>
          <span>Billing clarity</span>
          <span>Payment follow-up</span>
          <span>Customer trust</span>
        </div>
      </section>

      <section className="landing-cta">
        <Sparkles size={24} />
        <h2>Ready to continue?</h2>
        <p>Staff and customers can sign in securely to access the workspace, portal, bills, receipts, and service requests.</p>
        <button type="button" className="landing-primary-action" onClick={openLogin}>
          Login to {appName}
          <ArrowRight size={17} />
        </button>
      </section>

      <footer className="landing-footer">
        <span>{appName}</span>
        {email ? (
          <a href={`mailto:${email}`}>
            <Mail size={15} />
            {email}
          </a>
        ) : (
          <span>Water billing and customer management</span>
        )}
      </footer>

      {loginOpen ? (
        <div className="landing-login-overlay" role="presentation" onMouseDown={closeLogin}>
          <div className="landing-login-shell" role="dialog" aria-modal="true" aria-label="Login" onMouseDown={(event) => event.stopPropagation()}>
            {!hasResetToken() ? (
              <button type="button" className="landing-close-button" onClick={closeLogin} aria-label="Close login">
                <X size={17} />
              </button>
            ) : null}
            <LoginPage appName={appName} onLogin={onLogin} sessionMessage={sessionMessage} variant="modal" />
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default LandingPage;
