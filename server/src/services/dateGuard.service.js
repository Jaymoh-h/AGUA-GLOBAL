const ApiError = require("../utils/apiError");

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const localToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateOnly = (value) => String(value || "").slice(0, 10);

const readOverrideReason = (req) =>
  String(
    req?.body?.future_date_override_reason ||
      req?.body?.override_reason ||
      req?.body?.correction_reason ||
      ""
  ).trim();

const assertNotFutureDate = (value, req, label = "Date") => {
  if (!value) return null;
  const date = toDateOnly(value);
  if (!dateOnlyPattern.test(date)) return null;

  const today = localToday();
  if (date <= today) return null;

  if (req?.user?.role !== "admin") {
    throw new ApiError(400, `${label} cannot be later than today (${today}).`);
  }

  const reason = readOverrideReason(req);
  if (!reason) {
    throw new ApiError(400, `${label} is later than today (${today}). Admin override reason is required.`);
  }
  return reason;
};

const assertNoFutureDates = (entries, req) => {
  for (const entry of entries) {
    const reason = assertNotFutureDate(entry.value, req, entry.label);
    if (reason) return reason;
  }
  return null;
};

module.exports = {
  assertNoFutureDates,
  assertNotFutureDate,
  localToday
};
