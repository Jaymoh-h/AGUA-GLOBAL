import { createContext, useCallback, useContext, useMemo, useState } from "react";
import ToastMessage, { toastTypeFromMessage } from "./ToastMessage";

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
};

export const useToastMessage = () => {
  const { clearToast, showToast } = useToast();
  const setMessage = useCallback(
    (message, options = {}) => {
      const value = typeof message === "function" ? message("") : message;
      if (!value) {
        clearToast();
        return;
      }
      showToast(value, options);
    },
    [clearToast, showToast]
  );

  return ["", setMessage];
};

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, options = {}) => {
    const text = String(message || "").trim();
    if (!text) return;
    setToast({
      id: Date.now(),
      message: text,
      type: options.type || toastTypeFromMessage(text),
      duration: options.duration
    });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ clearToast, showToast }), [clearToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastMessage
        key={toast?.id || "empty-toast"}
        message={toast?.message}
        type={toast?.type}
        duration={toast?.duration}
        onClose={clearToast}
      />
    </ToastContext.Provider>
  );
}

export default ToastProvider;
