const ApiError = require("../utils/apiError");
const crypto = require("crypto");

const stores = new Set();

const toPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const createRateLimiter = ({
  windowMs,
  max,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  store = "memory",
  scope = "api",
  pool = null,
  hashSecret = "rate-limit"
}) => {
  const memoryStore = new Map();
  stores.add(memoryStore);
  const limitWindowMs = toPositiveNumber(windowMs, 15 * 60 * 1000);
  const maxRequests = toPositiveNumber(max, 600);

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt <= now) memoryStore.delete(key);
    }
  }, Math.min(limitWindowMs, 60 * 1000));
  cleanup.unref?.();

  const hitMemoryStore = (key) => {
    const now = Date.now();
    const existing = memoryStore.get(key);
    const entry =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + limitWindowMs
          };

    entry.count += 1;
    memoryStore.set(key, entry);
    return entry;
  };

  const hitDatabaseStore = async (key) => {
    const keyHash = crypto
      .createHmac("sha256", String(hashSecret || "rate-limit"))
      .update(`${scope}:${key}`)
      .digest("hex");
    const { rows } = await pool.query(
      `INSERT INTO rate_limit_buckets (
         key_hash, scope, request_count, reset_at, updated_at
       )
       VALUES ($1, $2, 1, NOW() + ($3::integer * INTERVAL '1 millisecond'), NOW())
       ON CONFLICT (key_hash)
       DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         reset_at = CASE
           WHEN rate_limit_buckets.reset_at <= NOW()
             THEN NOW() + ($3::integer * INTERVAL '1 millisecond')
           ELSE rate_limit_buckets.reset_at
         END,
         updated_at = NOW()
       RETURNING request_count, reset_at`,
      [keyHash, scope, Math.round(limitWindowMs)]
    );
    return {
      count: Number(rows[0].request_count || 0),
      resetAt: new Date(rows[0].reset_at).getTime()
    };
  };

  return async (req, res, next) => {
    const key = String(keyGenerator(req) || "unknown");
    let entry;
    if (store === "database" && pool) {
      try {
        entry = await hitDatabaseStore(key);
      } catch (error) {
        if (!["42P01", "42703"].includes(error.code)) return next(error);
        entry = hitMemoryStore(key);
      }
    } else {
      entry = hitMemoryStore(key);
    }

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
