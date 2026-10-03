import { AlertTriangle, RefreshCw } from "lucide-react";
import BrandLoader from "./BrandLoader";

function WorkspaceState({ detail, onRetry, state = "loading", title }) {
  const isError = state === "error";

  return (
    <section className={`workspace-state workspace-state-${state}`} role={isError ? "alert" : "status"} aria-live="polite">
      {isError ? <span className="workspace-state-icon"><AlertTriangle size={20} /></span> : <BrandLoader compact decorative />}
      <div>
        <p className="eyebrow">{isError ? "Workspace unavailable" : "Loading workspace"}</p>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={15} />Retry</button> : null}
    </section>
  );
}

export default WorkspaceState;
