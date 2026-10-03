import { CircleDollarSign, Droplets, Gauge, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import LoginPage from "./LoginPage";

const operatingFlow = [
  { label: "Measure", icon: Gauge },
  { label: "Bill", icon: ReceiptText },
  { label: "Collect", icon: CircleDollarSign }
];

function LandingPage({ appName, businessSettings = {}, onLogin, sessionMessage = "" }) {
  const email = String(businessSettings.email || "").trim();
  const year = new Date().getFullYear();

  return (
    <main className="access-landing">
      <section className="access-visual" aria-label={`${appName} overview`}>
        <img className="access-visual-image" src="/water-tech-hero.png" alt="Water meter and treatment infrastructure" />
        <div className="access-visual-shade" aria-hidden="true" />
        <div className="access-visual-content">
          <div className="access-brand">
            <span className="brand-mark"><Droplets size={22} /></span>
            <span>{appName}</span>
          </div>
          <div className="access-story">
            <p>Water operations platform</p>
            <h1>{appName}</h1>
            <span>Billing, collections and field work kept in one accountable operating view.</span>
          </div>
          <div className="access-operating-flow" aria-label="Operational workflow">
            {operatingFlow.map(({ label, icon: Icon }) => (
              <span key={label}><Icon size={16} />{label}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="access-auth" aria-label="Secure sign in">
        <div className="access-auth-content">
          <LoginPage appName={appName} onLogin={onLogin} sessionMessage={sessionMessage} variant="access" />
          <div className="access-trust-note">
            <ShieldCheck size={17} />
            <span>Secure access for assigned team and customer accounts.</span>
          </div>
          <footer className="access-footer">
            <span>© {year} {appName}</span>
            {email ? <a href={`mailto:${email}`}><Mail size={15} />Support</a> : <span>Secure session access</span>}
          </footer>
        </div>
      </section>
    </main>
  );
}

export default LandingPage;
