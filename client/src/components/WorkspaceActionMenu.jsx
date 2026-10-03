import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function WorkspaceActionMenu({ actions, label = "More actions" }) {
  const availableActions = actions.filter((action) => !action.hidden);
  const detailsRef = useRef(null);
  const menuRef = useRef(null);
  const summaryRef = useRef(null);
  const [mobileMenuStyle, setMobileMenuStyle] = useState(null);

  useEffect(() => {
    const closeOnPointerAway = (event) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) {
        detailsRef.current.removeAttribute("open");
        setMobileMenuStyle(null);
      }
    };
    document.addEventListener("pointerdown", closeOnPointerAway);
    return () => document.removeEventListener("pointerdown", closeOnPointerAway);
  }, []);

  if (!availableActions.length) return null;

  const positionMobileMenu = () => {
    window.requestAnimationFrame(() => {
      if (!detailsRef.current?.open || window.innerWidth > 720 || !summaryRef.current || !menuRef.current) {
        setMobileMenuStyle(null);
        return;
      }
      const padding = 12;
      const trigger = summaryRef.current.getBoundingClientRect();
      const menu = menuRef.current.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - padding * 2);
      const left = Math.min(Math.max(trigger.left, padding), window.innerWidth - width - padding);
      const preferredTop = trigger.bottom + 8;
      const top = preferredTop + menu.height > window.innerHeight ? Math.max(padding, trigger.top - menu.height - 8) : preferredTop;
      setMobileMenuStyle({ left: `${left}px`, position: "fixed", top: `${top}px`, width: `${width}px` });
    });
  };

  return (
    <details className="workspace-action-menu" onToggle={positionMobileMenu} ref={detailsRef}>
      <summary aria-label={label} ref={summaryRef} title={label}>
        <MoreHorizontal size={19} />
      </summary>
      <div className="workspace-action-menu-list" ref={menuRef} role="menu" style={mobileMenuStyle || undefined}>
        {availableActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              disabled={action.disabled}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                action.onSelect();
              }}
              role="menuitem"
              type="button"
            >
              {Icon ? <Icon size={16} /> : null}
              <span>{action.label}</span>
              {action.detail ? <small>{action.detail}</small> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export default WorkspaceActionMenu;
