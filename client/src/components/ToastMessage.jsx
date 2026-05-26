import { X } from "lucide-react";
import { useEffect } from "react";

const errorPattern =
  /failed|error|required|cannot|invalid|not found|permission|missing|must|unable|need correction|no ready|load .* first|map .* before/i;
const infoPattern = /editing|loading|refreshing/i;

export const toastTypeFromMessage = (message) => {
  if (errorPattern.test(String(message || ""))) return "error";
  if (infoPattern.test(String(message || ""))) return "info";
  return "success";
};

const labels = {
  error: "Failure",
  info: "Notice",
  success: "Success"
};

function ToastMessage({ message, type, onClose, duration = 4500 }) {
  const toastType = type || toastTypeFromMessage(message);
  const displayDuration = String(message || "").length > 120 ? Math.max(duration, 8000) : duration;

  useEffect(() => {
    if (!message || !onClose || displayDuration <= 0) return undefined;
    const timer = window.setTimeout(onClose, displayDuration);
    return () => window.clearTimeout(timer);
  }, [displayDuration, message, onClose]);

  if (!message) return null;

  return (
    <div
      className={`toast-message toast-${toastType}`}
      role={toastType === "error" ? "alert" : "status"}
      aria-live={toastType === "error" ? "assertive" : "polite"}
    >
      <strong>{labels[toastType] || labels.success}</strong>
      <span>{message}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss message" title="Dismiss">
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export default ToastMessage;
