import { BookOpen, Database, ExternalLink, FileText, LifeBuoy, ShieldCheck, Wrench } from "lucide-react";

const docGroups = [
  {
    title: "Operate",
    icon: Wrench,
    items: ["Billing workflow", "Meter reading workflow", "User manual", "Test checklist"]
  },
  {
    title: "Administer",
    icon: ShieldCheck,
    items: ["Roles and permissions", "Environment variables", "Deployment steps", "Backup and recovery"]
  },
  {
    title: "Integrate",
    icon: Database,
    items: ["API endpoints", "Database schema", "Implementation records", "Core business model"]
  }
];

function PublicDocsPage({ appName = "Water Billing" }) {
  return (
    <main className="public-surface public-docs-page">
      <nav className="public-nav" aria-label="Documentation navigation">
        <a href="/" className="landing-brand">
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          <strong>{appName} Docs</strong>
        </a>
        <a className="public-nav-link" href="/">
          Main app
          <ExternalLink size={15} />
        </a>
      </nav>

      <section className="public-hero">
        <div>
          <p className="eyebrow">Documentation hub</p>
          <h1>Operational notes for the billing workspace</h1>
          <p>
            A public-facing entry point for setup notes, support guidance, and release discipline. The full technical files remain in the
            repository `docs/` folder.
          </p>
        </div>
        <div className="public-doc-highlight">
          <FileText size={36} />
          <strong>Docs are grouped by the work people need to do</strong>
          <span>Operations, administration, and integration references can be expanded here as the deployment matures.</span>
        </div>
      </section>

      <section className="public-grid public-doc-grid">
        {docGroups.map((group) => {
          const Icon = group.icon;
          return (
            <article className="public-doc-card" key={group.title}>
              <Icon size={26} />
              <h2>{group.title}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="public-panel public-support-panel">
        <LifeBuoy size={24} />
        <div>
          <p className="eyebrow">Publishing model</p>
          <h3>Point `docs.your-domain` to the client project</h3>
          <p>
            The React app detects the `docs.` hostname and shows this documentation surface without requiring login. Internal manuals and
            sensitive SOPs should stay behind the main authenticated workspace until they are reviewed for public sharing.
          </p>
        </div>
      </section>
    </main>
  );
}

export default PublicDocsPage;
