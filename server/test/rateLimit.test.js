const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter, resetRateLimitStores } = require("../src/middleware/rateLimit");

const runLimiter = (limiter, key = "test-client") =>
  new Promise((resolve, reject) => {
    const headers = new Map();
    const req = { ip: key, headers: {} };
    const res = {
      setHeader(name, value) {
        headers.set(name, String(value));
      }
    };

    limiter(req, res, (error) => {
      if (error && !Number.isInteger(error.statusCode)) {
        reject(error);
        return;
      }
      resolve({ error, headers });
    });
  });

describe("rate limit middleware", () => {
  it("returns a 429 with retry metadata after the configured limit", async () => {
    resetRateLimitStores();
    const limiter = createRateLimiter({ windowMs: 30_000, max: 1, scope: "test" });

    const first = await runLimiter(limiter);
    assert.equal(first.error, undefined);
    assert.equal(first.headers.get("RateLimit-Remaining"), "0");

    const blocked = await runLimiter(limiter);
    assert.equal(blocked.error?.statusCode, 429);
    assert.equal(blocked.headers.get("RateLimit-Limit"), "1");
    assert.equal(blocked.headers.get("RateLimit-Remaining"), "0");
    assert.ok(Number(blocked.headers.get("RateLimit-Reset")) > 0);
    assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  });
});
