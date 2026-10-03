import { X } from "lucide-react";
import { useEffect } from "react";

function WorkspaceSideSheet({ children, onClose, open, subtitle, title }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="workspace-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="workspace-side-sheet" aria-label={title} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <p className="eyebrow">Workspace action</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close action panel" aria-label="Close action panel">
            <X size={18} />
          </button>
        </header>
        <div className="workspace-side-sheet-content">{children}</div>
      </aside>
    </div>
  );
}

export default WorkspaceSideSheet;
