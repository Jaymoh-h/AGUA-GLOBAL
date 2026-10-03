const storagePrefix = "agua:report-period-preset:";

const localDateInput = (dateValue = new Date()) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const profileKey = (user) => {
  const profileId = user?.access_profile_id;
  if (profileId !== undefined && profileId !== null && String(profileId) !== "") return `profile:${profileId}`;
  return `user:${user?.id || "anonymous"}:role:${user?.role || "unknown"}`;
};

export const reportPeriodPresets = [
  { key: "previous_month", label: "Last concluded month" },
  { key: "month_to_date", label: "Month to date" },
  { key: "quarter_to_date", label: "Quarter to date" },
  { key: "year_to_date", label: "Year to date" },
  { key: "custom", label: "Custom range" }
];

export const lastConcludedMonth = (now = new Date()) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(today.getFullYear(), today.getMonth(), 0);
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  return {
    key: localDateInput(startDate).slice(0, 7),
    start_date: localDateInput(startDate),
    end_date: localDateInput(endDate)
  };
};

export const filtersForReportPeriod = (preset, now = new Date()) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "previous_month") {
    const { start_date, end_date } = lastConcludedMonth(today);
    return { start_date, end_date };
  }

  if (preset === "quarter_to_date") {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
      start_date: localDateInput(new Date(today.getFullYear(), quarterStartMonth, 1)),
      end_date: localDateInput(today)
    };
  }

  if (preset === "year_to_date") {
    return {
      start_date: localDateInput(new Date(today.getFullYear(), 0, 1)),
      end_date: localDateInput(today)
    };
  }

  return {
    start_date: localDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: localDateInput(today)
  };
};

export const readReportPeriodPreset = (user) => {
  if (typeof window === "undefined") return "previous_month";
  try {
    const preset = window.localStorage.getItem(`${storagePrefix}${profileKey(user)}`);
    return reportPeriodPresets.some((item) => item.key === preset) ? preset : "previous_month";
  } catch (_error) {
    return "previous_month";
  }
};

export const readCustomReportPeriod = (user) => {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${storagePrefix}${profileKey(user)}:custom`));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(saved?.start_date || ""))) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(saved?.end_date || ""))) return null;
    return saved;
  } catch (_error) {
    return null;
  }
};

export const saveReportPeriodPreset = (user, preset) => {
  if (typeof window === "undefined" || !reportPeriodPresets.some((item) => item.key === preset)) return;
  try {
    window.localStorage.setItem(`${storagePrefix}${profileKey(user)}`, preset);
  } catch (_error) {
    // Period selection remains available when local storage is unavailable.
  }
};

export const saveCustomReportPeriod = (user, filters) => {
  if (typeof window === "undefined") return;
  const startDate = String(filters?.start_date || "");
  const endDate = String(filters?.end_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return;
  try {
    window.localStorage.setItem(`${storagePrefix}${profileKey(user)}:custom`, JSON.stringify({ start_date: startDate, end_date: endDate }));
  } catch (_error) {
    // Period selection remains available when local storage is unavailable.
  }
};
