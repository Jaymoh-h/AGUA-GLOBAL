const parseCookies = (header = "") =>
  String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!name) return cookies;
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value || "")}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = String(options.sameSite).toLowerCase();
    const label = sameSite === "none" ? "None" : sameSite === "strict" ? "Strict" : "Lax";
    parts.push(`SameSite=${label}`);
  }
  return parts.join("; ");
};

module.exports = {
  parseCookies,
  serializeCookie
};
