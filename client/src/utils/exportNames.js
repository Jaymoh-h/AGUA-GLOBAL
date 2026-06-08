const extensionPattern = /\.[a-z0-9]+$/i;
const maxFilenameLength = 140;

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
  return limitFilenameLength(`${base || "export"}${ext ? `.${ext}` : ""}`);
};

export const ensureExtension = (filename, extension) => {
  if (!filename) return namedExport("download", extension);
  if (extensionPattern.test(filename)) return limitFilenameLength(filename);
  return namedExport(filename, extension);
};

export const limitFilenameLength = (filename) => {
  const clean = String(filename || "download").trim() || "download";
  if (clean.length <= maxFilenameLength) return clean;
  const extension = clean.match(extensionPattern)?.[0] || "";
  const base = extension ? clean.slice(0, -extension.length) : clean;
  return `${base.slice(0, maxFilenameLength - extension.length)}${extension}`;
};

export const downloadBlobFile = (blob, filename, extension = "") => {
  const downloadName = extension ? ensureExtension(filename, extension) : limitFilenameLength(filename || "download");
  const file =
    typeof File === "function"
      ? new File([blob], downloadName, { type: blob.type || "application/octet-stream" })
      : blob;
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

const printablePageHeightPx = () => ((297 - 28) * 96) / 25.4;

const clearPrintFooterSpacers = () => {
  document.querySelectorAll(".print-footer-spacer").forEach((spacer) => spacer.remove());
};

const preparePrintFooterSpacing = () => {
  clearPrintFooterSpacers();
  const pageHeight = printablePageHeightPx();
  const surfaces = document.querySelectorAll(".active-print-surface.report-print, .receipt-print");
  surfaces.forEach((surface) => {
    const footer = surface.querySelector(".report-print-footer, .receipt-footer");
    if (!footer) return;

    const previousDisplay = surface.style.display;
    const previousVisibility = surface.style.visibility;
    const wasHidden = window.getComputedStyle(surface).display === "none";
    if (wasHidden) {
      surface.style.display = "block";
      surface.style.visibility = "hidden";
    }

    const spacer = document.createElement("div");
    spacer.className = "print-footer-spacer";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = "0px";
    footer.parentNode.insertBefore(spacer, footer);

    const totalHeight = surface.scrollHeight;
    const remainder = totalHeight % pageHeight;
    const spacerHeight = remainder > 1 ? pageHeight - remainder : 0;
    spacer.style.height = `${Math.max(0, spacerHeight)}px`;

    if (wasHidden) {
      surface.style.display = previousDisplay;
      surface.style.visibility = previousVisibility;
    }
  });
};

export const withPrintTitle = (title, printCallback = () => window.print()) => {
  const previousTitle = document.title;
  document.title = slugifyFilenamePart(title, "print");
  preparePrintFooterSpacing();
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    clearPrintFooterSpacers();
    window.removeEventListener("afterprint", restore);
    window.removeEventListener("focus", delayedRestore);
    document.removeEventListener("visibilitychange", restoreWhenVisible);
  };
  const delayedRestore = () => window.setTimeout(restore, 1200);
  const restoreWhenVisible = () => {
    if (document.visibilityState === "visible") delayedRestore();
  };
  window.addEventListener("afterprint", restore, { once: true });
  window.addEventListener("focus", delayedRestore, { once: true });
  document.addEventListener("visibilitychange", restoreWhenVisible);
  try {
    printCallback();
  } catch (error) {
    restore();
    throw error;
  }
  window.setTimeout(restore, 60000);
};
