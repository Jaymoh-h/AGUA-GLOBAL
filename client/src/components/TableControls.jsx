import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const pageSizeOptions = [10, 25, 50, 1000000];

const searchableText = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(searchableText).join(" ");
  if (typeof value === "object") return Object.values(value).map(searchableText).join(" ");
  return String(value);
};

const readPath = (row, path) =>
  String(path)
    .split(".")
    .reduce((value, key) => (value && value[key] !== undefined ? value[key] : ""), row);

export const useTableControls = (rows, { pageSize: initialPageSize = 10, searchFields = [] } = {}) => {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) => {
      const haystack = searchFields.length
        ? searchFields.map((field) => searchableText(readPath(row, field))).join(" ")
        : searchableText(row);
      return haystack.toLowerCase().includes(normalizedQuery);
    });
  }, [query, rows, searchFields]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = total ? (currentPage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, total);
  const visibleRows = filteredRows.slice(startIndex, endIndex);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, rows.length]);

  return {
    query,
    setQuery,
    pageSize,
    setPageSize: (value) => setPageSize(Number(value)),
    page: currentPage,
    setPage,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: endIndex,
    filteredRows,
    visibleRows
  };
};

function TableControls({ table, label = "rows", placeholder = "Search table" }) {
  return (
    <div className="table-toolbar">
      <label className="table-search">
        <Search size={15} />
        <input
          value={table.query}
          onChange={(event) => table.setQuery(event.target.value)}
          placeholder={placeholder}
          type="search"
        />
      </label>
      <div className="table-pager">
        <span>
          {table.start}-{table.end} of {table.total} {label}
        </span>
        <select value={table.pageSize} onChange={(event) => table.setPageSize(event.target.value)} aria-label="Rows per page">
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option > 1000 ? "All rows" : `${option} rows`}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => table.setPage(table.page - 1)} disabled={table.page <= 1} title="Previous page">
          <ChevronLeft size={15} />
        </button>
        <strong>
          {table.page}/{table.pageCount}
        </strong>
        <button
          type="button"
          onClick={() => table.setPage(table.page + 1)}
          disabled={table.page >= table.pageCount}
          title="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default TableControls;
