import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Droplets,
  Factory,
  Gauge,
  Mail,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import LoginPage from "./LoginPage";

const hasResetToken = () => Boolean(new URLSearchParams(window.location.search).get("reset_token"));

const workflow = [
  { number: "01", label: "Produce", icon: Factory },
  { number: "02", label: "Measure", icon: Gauge },
  { number: "03", label: "Bill", icon: ReceiptText },
  { number: "04", label: "Collect", icon: CircleDollarSign }
];

const capabilities = [
  {
    icon: Gauge,
    eyebrow: "Meter to account",
    title: "Turn every reading into a reliable record.",
    text: "Capture consumption, manage corrections, and keep the history behind every customer balance easy to follow."
  },
  {
    icon: CircleDollarSign,
    eyebrow: "Bill to receipt",
    title: "Make money movement clear.",
    text: "Prepare bills, allocate payments, issue receipts, and see what is paid, pending, or overdue without piecing together separate records."
  },
  {
    icon: Activity,
    eyebrow: "Source to service",
    title: "See the operation behind the tap.",
    text: "Follow production, expenses, maintenance, and service activity so teams can act on what the numbers are saying."
  }
];

function LandingPage({ appName, businessSettings = {}, onLogin, sessionMessage = "" }) {
  const [loginOpen, setLoginOpen] = useState(hasResetToken);
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

  return (
    <main className="landing-page">
      <section className={`landing-hero ${loginOpen ? "landing-muted" : ""}`}>
        <div className="landing-hero-media" aria-hidden="true">
          <img src="/water-tech-hero.png" alt="" />
        </div>

        <nav className="landing-nav" aria-label="Public navigation">
          <a className="landing-brand" href="#top" aria-label={`${appName} home`}>
            <span className="brand-mark">
              <Droplets size={22} />
            </span>
            <strong>{appName}</strong>
          </a>
          <button type="button" className="landing-login-button" onClick={openLogin}>
            Sign in
            <ArrowRight size={16} />
          </button>
        </nav>

        <div className="landing-hero-content" id="top">
          <p className="landing-kicker"><span /> Water operations, in full view</p>
          <h1>{appName}</h1>
          <p className="landing-hero-copy">
            One connected workspace for the people who produce water, read meters, serve customers, collect payments, and keep the whole operation moving.
          </p>
          <div className="landing-actions">
            <button type="button" className="landing-primary-action" onClick={openLogin}>
              Enter your workspace
              <ArrowRight size={17} />
            </button>
            <a href="#platform">
              See how it flows
              <ArrowDownRight size={16} />
            </a>
          </div>
        </div>

        <div className="landing-workflow" aria-label="Water business workflow">
          {workflow.map(({ number, label, icon: Icon }) => (
            <div key={label}>
              <span>{number}</span>
              <Icon size={18} />
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-intro" id="platform">
        <div className="landing-intro-heading">
          <p className="landing-kicker landing-kicker-dark"><span /> One source of operational truth</p>
          <h2>Every drop has a journey.<br />Now every record does too.</h2>
        </div>
        <p className="landing-intro-copy">
          Water service is a chain of connected decisions. {appName} brings those decisions into one practical view, so staff spend less time reconciling information and more time improving service.
        </p>
      </section>

      <section className="landing-capabilities" aria-label="Platform capabilities">
        {capabilities.map(({ icon: Icon, eyebrow, title, text }, index) => (
          <article key={eyebrow}>
            <div className="landing-capability-number">0{index + 1}</div>
            <div className="landing-capability-icon"><Icon size={22} /></div>
            <div>
              <p>{eyebrow}</p>
              <h3>{title}</h3>
              <span>{text}</span>
            </div>
            <ArrowDownRight className="landing-capability-arrow" size={22} />
          </article>
        ))}
      </section>

      <section className="landing-two-sides">
        <div className="landing-side landing-side-team">
          <div className="landing-side-icon"><BarChart3 size={24} /></div>
          <p>For your team</p>
          <h2>Know what needs attention before it becomes urgent.</h2>
          <ul>
            <li><ShieldCheck size={17} /> Accountable records and approvals</li>
            <li><Activity size={17} /> Production and financial visibility</li>
            <li><UsersRound size={17} /> Clear ownership across daily work</li>
          </ul>
        </div>
        <div className="landing-side landing-side-customer">
          <div className="landing-side-icon"><UsersRound size={24} /></div>
          <p>For your customers</p>
          <h2>Give every account a clearer, calmer experience.</h2>
          <ul>
            <li><Gauge size={17} /> Readings and consumption history</li>
            <li><ReceiptText size={17} /> Bills, balances, and receipts</li>
            <li><Mail size={17} /> Service information in one place</li>
          </ul>
        </div>
      </section>

      <section className="landing-closing">
        <div>
          <p className="landing-kicker landing-kicker-dark"><span /> Ready when you are</p>
          <h2>Keep water moving.<br />Keep everyone informed.</h2>
        </div>
        <button type="button" className="landing-closing-action" onClick={openLogin}>
          <span>Open {appName}</span>
          <ArrowRight size={22} />
        </button>
      </section>

      <footer className="landing-footer">
        <div className="landing-brand">
          <span className="brand-mark"><Droplets size={19} /></span>
          <strong>{appName}</strong>
        </div>
        <span>Water operations, connected.</span>
        {email ? (
          <a href={`mailto:${email}`}>
            <Mail size={15} />
            {email}
          </a>
        ) : null}
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
