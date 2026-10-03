import { rowsToCsv } from "./csvTemplate";

let pdfJsLoader;

const loadPdfJs = async () => {
  if (!pdfJsLoader) {
    pdfJsLoader = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]).then(
      ([pdfjsLib, worker]) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjsLib;
      }
    );
  }
  return pdfJsLoader;
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const bankDatePattern = /(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/;
const bankAmountPattern = /(?:kes|ksh|cr)?\s*[\d,]+\.\d{2}\b|(?:kes|ksh|cr)?\s*[\d,]{4,}\b/i;

export const pdfReadErrorMessage = (err, hasPassword) => {
  if (err?.name === "PasswordException" || /password/i.test(err?.message || "")) {
    return hasPassword
      ? "The PDF password was rejected. Check the password and try again."
      : "This PDF is password-protected. Enter the statement password and retry.";
  }
  if (/permission|encrypted|protected|copy/i.test(err?.message || "")) {
    return "The PDF opened with restrictions that blocked text extraction. Use a bank CSV export, an unlocked copy, or paste the statement text into the box.";
  }
  return `Could not read the PDF statement: ${err.message}`;
};

const splitPdfLineIntoCells = (items) => {
  const cells = [];
  items
    .sort((left, right) => left.x - right.x)
    .forEach((item) => {
      const text = String(item.text || "").trim();
      if (!text) return;
      const width = Number(item.width || text.length * 5);
      const end = item.x + width;
      const current = cells[cells.length - 1];
      const gap = current ? item.x - current.end : 0;

      if (!current || gap > 18) {
        cells.push({ x: item.x, end, text });
      } else {
        current.text = `${current.text}${gap > 2 ? " " : ""}${text}`.replace(/\s+/g, " ").trim();
        current.end = Math.max(current.end, end);
      }
    });
  return cells;
};

const makeUniqueHeaders = (headers) => {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
};

const pdfHeaderScore = (line) => {
  const text = normalizeText(line.text);
  return [
    /date/.test(text),
    /description|narration|particular|detail|remarks/.test(text),
    /reference|ref|transaction/.test(text),
    /credit|deposit|paid|amount/.test(text),
    /balance/.test(text)
  ].filter(Boolean).length;
};

const lineLooksLikePayment = (line) => bankDatePattern.test(line.text) && bankAmountPattern.test(line.text);

const ignoredPdfContinuationLine = (line) => {
  const text = normalizeText(line.text);
  if (!text) return true;
  return /^(opening|closing|available|ledger|brought forward|carried forward|total|balance)/.test(text);
};

const preferredContinuationIndex = (headers) => {
  const scored = headers.map((header, index) => {
    const text = normalizeText(header);
    let score = index === 0 ? 1 : 0;
    if (/description|narration|particular|detail|remarks|payer|name/.test(text)) score += 5;
    if (/reference|ref|transaction/.test(text)) score += 2;
    if (/date|amount|credit|debit|balance/.test(text)) score -= 3;
    return { index, score };
  });
  return scored.sort((left, right) => right.score - left.score)[0]?.index || 0;
};

const nearestPdfColumnIndex = (cell, anchors) =>
  anchors.reduce((bestIndex, anchor, anchorIndex) => {
    const bestDistance = Math.abs(cell.x - anchors[bestIndex]);
    const currentDistance = Math.abs(cell.x - anchor);
    return currentDistance < bestDistance ? anchorIndex : bestIndex;
  }, 0);

const appendPdfCellToRow = (row, header, value) => {
  row[header] = [row[header], value].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
};

const typicalPdfLineGap = (lines) => {
  const gaps = [];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (previous.pageNumber !== current.pageNumber) continue;
    const gap = Math.abs(previous.y - current.y);
    if (gap >= 4 && gap <= 40) gaps.push(gap);
  }
  if (!gaps.length) return 12;
  return gaps.sort((left, right) => left - right)[Math.floor(gaps.length / 2)];
};

const appendPdfContinuationLine = (row, line, headers, anchors, continuationIndex) => {
  line.cells.forEach((cell) => {
    const nearestIndex = nearestPdfColumnIndex(cell, anchors);
    const targetIndex = nearestIndex <= continuationIndex + 1 ? continuationIndex : nearestIndex;
    appendPdfCellToRow(row, headers[targetIndex], cell.text);
  });
};

const parsePdfPaymentLines = (text) => {
  const rows = [];
  const headers = ["payment_date", "narration", "external_reference", "amount"];
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const dateMatch = line.match(bankDatePattern);
      if (!dateMatch) return;

      const afterDate = line.slice(dateMatch.index + dateMatch[0].length).trim();
      const amountMatches = [...afterDate.matchAll(new RegExp(bankAmountPattern, "gi"))];
      if (!amountMatches.length) return;

      const amountMatch = amountMatches[amountMatches.length - 1];
      const beforeAmount = afterDate.slice(0, amountMatch.index).trim();
      const referenceMatch = beforeAmount.match(/\b[A-Z0-9]{6,}\b/g);
      const reference = referenceMatch?.[referenceMatch.length - 1] || "";
      const narration = reference ? beforeAmount.replace(reference, "").replace(/\s+/g, " ").trim() : beforeAmount;

      rows.push({
        _rowNumber: index + 1,
        payment_date: dateMatch[0],
        narration: narration || beforeAmount || line,
        external_reference: reference,
        amount: amountMatch[0]
      });
    });
  return { headers, rows };
};

const buildPdfFallbackCsv = (rawText) => {
  const parsed = parsePdfPaymentLines(rawText);
  if (!parsed.rows.length) return null;
  return {
    ...parsed,
    csv: rowsToCsv(parsed.headers.map((header) => ({ header, value: (row) => row[header] || "" })), parsed.rows)
  };
};

const buildPdfTableCsv = (lines) => {
  const headerIndex = lines.findIndex((line) => line.cells.length >= 3 && pdfHeaderScore(line) >= 2);
  if (headerIndex === -1) return null;

  const headerLine = lines[headerIndex];
  const headers = makeUniqueHeaders(headerLine.cells.map((cell) => cell.text));
  const anchors = headerLine.cells.map((cell) => cell.x);
  const continuationIndex = preferredContinuationIndex(headers);
  const bodyLines = lines.slice(headerIndex + 1).filter((line) => line.cells.length && !ignoredPdfContinuationLine(line));
  const lineGap = typicalPdfLineGap(bodyLines);
  const continuationDistance = Math.max(lineGap * 1.8, 18);
  const paymentIndexes = bodyLines.map((line, index) => (lineLooksLikePayment(line) ? index : -1)).filter((index) => index >= 0);
  const continuationByPaymentIndex = new Map(paymentIndexes.map((index) => [index, []]));
  const rows = [];

  bodyLines.forEach((line, index) => {
    if (lineLooksLikePayment(line)) return;
    const nearestPaymentIndex = paymentIndexes
      .filter((paymentIndex) => bodyLines[paymentIndex].pageNumber === line.pageNumber)
      .map((paymentIndex) => ({ paymentIndex, distance: Math.abs(bodyLines[paymentIndex].y - line.y) }))
      .filter((candidate) => candidate.distance <= continuationDistance)
      .sort((left, right) => left.distance - right.distance)[0]?.paymentIndex;
    if (nearestPaymentIndex !== undefined) continuationByPaymentIndex.get(nearestPaymentIndex)?.push({ index, line });
  });

  paymentIndexes.forEach((paymentIndex) => {
    const line = bodyLines[paymentIndex];
    const row = { _rowNumber: paymentIndex + headerIndex + 2 };
    headers.forEach((header) => { row[header] = ""; });

    continuationByPaymentIndex.get(paymentIndex)?.filter((item) => item.index < paymentIndex).sort((left, right) => left.index - right.index)
      .forEach((item) => appendPdfContinuationLine(row, item.line, headers, anchors, continuationIndex));
    line.cells.forEach((cell) => appendPdfCellToRow(row, headers[nearestPdfColumnIndex(cell, anchors)], cell.text));
    continuationByPaymentIndex.get(paymentIndex)?.filter((item) => item.index > paymentIndex).sort((left, right) => left.index - right.index)
      .forEach((item) => appendPdfContinuationLine(row, item.line, headers, anchors, continuationIndex));
    rows.push(row);
  });

  if (!rows.length) return null;
  return {
    headers,
    rows,
    csv: rowsToCsv(headers.map((header) => ({ header, value: (row) => row[header] || "" })), rows)
  };
};

export const extractPdfStatementTable = async (file, password = "") => {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data, password: password || undefined }).promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = new Map();

    content.items.forEach((item) => {
      const text = String(item.str || "").trim();
      if (!text) return;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const line = pageLines.get(y) || [];
      line.push({ x, text, width: item.width || 0 });
      pageLines.set(y, line);
    });

    lines.push(
      ...[...pageLines.entries()]
        .sort((left, right) => right[0] - left[0])
        .map(([y, items]) => {
          const cells = splitPdfLineIntoCells(items);
          return { pageNumber, y, cells, text: cells.map((cell) => cell.text).join(" ") };
        })
    );
  }

  const rawText = lines.map((line) => line.text).join("\n");
  return { rawText, table: buildPdfTableCsv(lines) || buildPdfFallbackCsv(rawText) };
};
