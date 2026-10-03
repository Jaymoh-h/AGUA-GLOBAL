import { Plus, X } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

function EntryPanel({
  actionLabel = "Add record",
  children,
  className = "",
  disabled = false,
  icon = null,
  onOpenChange,
  open = false,
  summary = "",
  title
}) {
  return (
    <CollapsibleSection
      actions={
        open ? (
          <button
            aria-label="Close entry panel"
            className="icon-button"
            disabled={disabled}
            onClick={() => onOpenChange(false)}
            title="Close entry panel"
            type="button"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            className="primary-button entry-panel-open"
            disabled={disabled}
            onClick={() => onOpenChange(true)}
            type="button"
          >
            <Plus size={16} />
            {actionLabel}
          </button>
        )
      }
      className={`entry-panel ${className}`.trim()}
      disabled={disabled}
      icon={icon}
      onOpenChange={onOpenChange}
      open={open}
      summary={summary}
      title={title}
    >
      {children}
    </CollapsibleSection>
  );
}

export default EntryPanel;
