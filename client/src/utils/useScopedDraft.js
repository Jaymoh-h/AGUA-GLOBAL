import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const draftPrefix = "agua:draft:";

const getDraftStorage = (storageType) => (storageType === "local" ? window.localStorage : window.sessionStorage);

const readDraft = (storageKey, createInitial, storageType) => {
  try {
    const saved = getDraftStorage(storageType).getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch (_error) {
    // A malformed or unavailable session store should never block the form.
  }
  return createInitial();
};

export default function useScopedDraft(user, draftId, createInitial, options = {}) {
  const storageType = options.storage === "local" ? "local" : "session";
  const storageKey = useMemo(
    () => `${draftPrefix}${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}:${draftId}`,
    [draftId, user?.access_profile_id, user?.id]
  );
  const [draft, setDraft] = useState(() => readDraft(storageKey, createInitial, storageType));
  const clearPending = useRef(false);

  useEffect(() => {
    clearPending.current = false;
    setDraft(readDraft(storageKey, createInitial, storageType));
  }, [storageKey, storageType]);

  useEffect(() => {
    if (clearPending.current) {
      clearPending.current = false;
      return;
    }
    try {
      getDraftStorage(storageType).setItem(storageKey, JSON.stringify(draft));
    } catch (_error) {
      // Draft retention is a convenience and should not interrupt normal work.
    }
  }, [draft, storageKey, storageType]);

  const clearDraft = useCallback(() => {
    clearPending.current = true;
    try {
      getDraftStorage(storageType).removeItem(storageKey);
    } catch (_error) {
      // Continue with a fresh in-memory form when session storage is unavailable.
    }
    setDraft(createInitial());
  }, [createInitial, storageKey, storageType]);

  return [draft, setDraft, clearDraft];
}
