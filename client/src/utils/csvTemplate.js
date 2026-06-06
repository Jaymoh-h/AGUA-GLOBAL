import { downloadBlobFile } from "./exportNames";

export const downloadCsvTemplate = (filename, headers) => {
  const csv = `${headers.join(",")}\n`;
  downloadCsv(filename, csv);
};

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const rowsToCsv = (columns, rows) => {
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(","));
  return [header, ...body].join("\n") + "\n";
};

export const downloadCsvRows = (filename, columns, rows) => {
  downloadCsv(filename, rowsToCsv(columns, rows));
};

export const downloadCsv = (filename, csv) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlobFile(blob, filename, "csv");
};

export const downloadJson = (filename, data) => {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  downloadBlobFile(blob, filename, "json");
};
