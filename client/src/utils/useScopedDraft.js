import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const draftPrefix = "agua:draft:";

const readDraft = (storageKey, createInitial) => {
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch (_error) {
    // A malformed or unavailable session store should never block the form.
  }
  return createInitial();
};

export default function useScopedDraft(user, draftId, createInitial) {
  const storageKey = useMemo(
    () => `${draftPrefix}${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}:${draftId}`,
    [draftId, user?.access_profile_id, user?.id]
  );
  const [draft, setDraft] = useState(() => readDraft(storageKey, createInitial));
  const clearPending = useRef(false);

  useEffect(() => {
    clearPending.current = false;
    setDraft(readDraft(storageKey, createInitial));
  }, [storageKey]);

  useEffect(() => {
    if (clearPending.current) {
      clearPending.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch (_error) {
      // Draft retention is a convenience and should not interrupt normal work.
    }
  }, [draft, storageKey]);

  const clearDraft = useCallback(() => {
    clearPending.current = true;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch (_error) {
      // Continue with a fresh in-memory form when session storage is unavailable.
    }
    setDraft(createInitial());
  }, [createInitial, storageKey]);

  return [draft, setDraft, clearDraft];
}
