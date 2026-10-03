import { useCallback, useEffect, useMemo, useState } from "react";

const storagePrefix = "agua:dashboard-preferences:";
const preferenceNames = new Set(["showInsights", "showClearedChecks", "compactPriorities"]);

const createDefaults = (role) => ({
  showInsights: role !== "meter_reader" && role !== "customer",
  showClearedChecks: false,
  compactPriorities: false
});

const readPreferences = (storageKey, defaults) => {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;

    return Object.fromEntries(
      Object.entries(defaults).map(([name, defaultValue]) => [
        name,
        typeof saved[name] === "boolean" ? saved[name] : defaultValue
      ])
    );
  } catch (_error) {
    return defaults;
  }
};

const writePreferences = (storageKey, preferences) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch (_error) {
    // Preferences are optional and should not interrupt the dashboard.
  }
};

export default function useDashboardPreferences(user) {
  const defaults = useMemo(() => createDefaults(user?.role), [user?.role]);
  const storageKey = useMemo(() => {
    const accessProfileId = user?.access_profile_id;
    const hasAccessProfile = accessProfileId !== undefined && accessProfileId !== null && String(accessProfileId) !== "";

    return hasAccessProfile
      ? `${storagePrefix}profile:${accessProfileId}`
      : `${storagePrefix}user:${user?.id || "anonymous"}:role:${user?.role || "unknown"}`;
  }, [user?.access_profile_id, user?.id, user?.role]);

  const [state, setState] = useState(() => ({
    storageKey,
    preferences: readPreferences(storageKey, defaults)
  }));

  const preferences = state.storageKey === storageKey
    ? state.preferences
    : readPreferences(storageKey, defaults);

  useEffect(() => {
    setState({
      storageKey,
      preferences: readPreferences(storageKey, defaults)
    });
  }, [defaults, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleStorage = (event) => {
      if (event.storageArea === window.localStorage && event.key === storageKey) {
        setState({
          storageKey,
          preferences: readPreferences(storageKey, defaults)
        });
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [defaults, storageKey]);

  const setPreference = useCallback((name, value) => {
    if (!preferenceNames.has(name) || typeof value !== "boolean") return;

    setState((current) => {
      const currentPreferences = current.storageKey === storageKey
        ? current.preferences
        : readPreferences(storageKey, defaults);
      const nextPreferences = { ...currentPreferences, [name]: value };
      writePreferences(storageKey, nextPreferences);

      return { storageKey, preferences: nextPreferences };
    });
  }, [defaults, storageKey]);

  const resetPreferences = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch (_error) {
        // Continue with defaults when local storage is unavailable.
      }
    }

    setState({ storageKey, preferences: defaults });
  }, [defaults, storageKey]);

  return { preferences, setPreference, resetPreferences };
}
