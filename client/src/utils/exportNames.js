const extensionPattern = /\.[a-z0-9]+$/i;

export const slugifyFilenamePart = (value, fallback = "export") => {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
};

export const localDateStamp = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const namedExport = (label, extension = "csv", parts = []) => {
  const ext = String(extension || "").replace(/^\./, "");
  const baseParts = [label, ...parts].filter((part) => part !== null && part !== undefined && String(part).trim() !== "");
  const base = baseParts.map((part) => slugifyFilenamePart(part)).filter(Boolean).join("-");
  return `${base || "export"}${ext ? `.${ext}` : ""}`;
};

export const ensureExtension = (filename, extension) => {
  if (!filename) return namedExport("download", extension);
  if (extensionPattern.test(filename)) return filename;
  return namedExport(filename, extension);
};

export const withPrintTitle = (title, printCallback = () => window.print()) => {
  const previousTitle = document.title;
  document.title = slugifyFilenamePart(title, "print");
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore, { once: true });
  try {
    printCallback();
  } catch (error) {
    restore();
    throw error;
  }
  window.setTimeout(restore, 1500);
};
