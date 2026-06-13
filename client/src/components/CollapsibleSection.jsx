import { ChevronDown } from "lucide-react";
import { useState } from "react";

function CollapsibleSection({
  actions = null,
  as: Component = "div",
  children,
  className = "",
  defaultOpen = false,
  icon = null,
  summary = "",
  title,
  ...props
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Component className={`panel collapsible-panel ${className}`.trim()} {...props}>
      <div className="collapsible-heading">
        <button
          aria-expanded={open}
          className="collapsible-trigger"
          onClick={() => setOpen((current) => !current)}
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
