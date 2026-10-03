import { ChevronDown } from "lucide-react";
import { useState } from "react";

function CollapsibleSection({
  actions = null,
  as: Component = "div",
  children,
  className = "",
  defaultOpen = false,
  disabled = false,
  icon = null,
  onOpenChange,
  open: controlledOpen,
  summary = "",
  title,
  ...props
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = typeof controlledOpen === "boolean" ? controlledOpen : uncontrolledOpen;

  const toggle = () => {
    if (disabled) return;
    const next = !open;
    if (typeof controlledOpen !== "boolean") setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Component className={`panel collapsible-panel ${className}`.trim()} {...props}>
      <div className="collapsible-heading">
        <button
          aria-expanded={open}
          className="collapsible-trigger"
          disabled={disabled}
          onClick={toggle}
          type="button"
        >
          <span className="collapsible-title">
            {icon}
            <span>{title}</span>
          </span>
          {summary ? <small>{summary}</small> : null}
          <ChevronDown className={open ? "collapsible-chevron open" : "collapsible-chevron"} size={16} />
        </button>
        {actions ? <div className="row-actions collapsible-actions">{actions}</div> : null}
      </div>
      {open ? <div className="collapsible-content">{children}</div> : null}
    </Component>
  );
}

export default CollapsibleSection;
