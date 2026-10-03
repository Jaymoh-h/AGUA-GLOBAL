import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

function ReviewDialog({
  open,
  eyebrow = "Review action",
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  secondaryLabel,
  reasonLabel = "Reason",
  reasonPlaceholder = "Add a clear reason for the audit trail",
  initialReason = "",
  reasonRequired = true,
  confirmDisabled = false,
  busy = false,
  busyLabel = "Saving...",
  danger = false,
  children,
  onCancel,
  onConfirm,
  onSecondary
}) {
  const [reason, setReason] = useState(initialReason);
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);

  cancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    setReason(initialReason);
    const focusTimer = window.setTimeout(() => (inputRef.current || confirmRef.current)?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) cancelRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, initialReason]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const reasonIsValid = !reasonLabel || !reasonRequired || Boolean(trimmedReason);

  const submit = (event) => {
    event.preventDefault();
    if (!reasonIsValid || busy) return;
    onConfirm(trimmedReason);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onCancel()}>
      <form
        className="modal-panel review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onCancel} disabled={busy}>
            <X size={17} />
          </button>
        </div>
        {description ? <p className="review-dialog-description" id={descriptionId}>{description}</p> : null}
        {children}
        {reasonLabel ? (
          <label>
            {reasonLabel}
            <textarea
              ref={inputRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows="4"
              required={reasonRequired}
              disabled={busy}
            />
          </label>
        ) : null}
        <div className="review-dialog-actions">
          <button
            ref={confirmRef}
            className={danger ? "danger-button" : "primary-button"}
            type="submit"
            disabled={busy || !reasonIsValid || confirmDisabled}
          >
            <Check size={16} />
            {busy ? busyLabel : confirmLabel}
          </button>
          {secondaryLabel ? (
            <button type="button" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" onClick={onCancel} disabled={busy}>
            <X size={16} />
            {cancelLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ReviewDialog;
