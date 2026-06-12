const ApiError = require("../utils/apiError");

const stores = new Set();

const toPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const createRateLimiter = ({
  windowMs,
  max,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown"
}) => {
  const store = new Map();
  stores.add(store);
  const limitWindowMs = toPositiveNumber(windowMs, 15 * 60 * 1000);
  const maxRequests = toPositiveNumber(max, 600);

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, Math.min(limitWindowMs, 60 * 1000));
  cleanup.unref?.();

  return (req, res, next) => {
    const key = String(keyGenerator(req) || "unknown");
    const now = Date.now();
    const existing = store.get(key);
    const entry =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + limitWindowMs
          };

    entry.count += 1;
    store.set(key, entry);

    const remaining = Math.max(maxRequests - entry.count, 0);
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return next(new ApiError(429, message));
    }

    return next();
  };
};

const resetRateLimitStores = () => {
  for (const store of stores) store.clear();
};

module.exports = {
  createRateLimiter,
  resetRateLimitStores
};
