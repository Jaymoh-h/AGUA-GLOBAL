import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const pageSizeOptions = [10, 25, 50, 100];

export default function useReadingRegister({ customerId, dateFrom, dateTo, refreshKey }) {
  const [query, setQueryValue] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeValue] = useState(25);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query);
  const requestParams = useMemo(
    () => ({
      ...(customerId ? { customer_id: customerId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(deferredQuery.trim() ? { search: deferredQuery.trim() } : {})
    }),
    [customerId, dateFrom, dateTo, deferredQuery]
  );

  useEffect(() => {
    setPage(1);
  }, [customerId, dateFrom, dateTo, deferredQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.readings
      .register({ ...requestParams, limit: pageSize, offset: (page - 1) * pageSize })
      .then((nextResult) => {
        if (active) setResult(nextResult);
      })
      .catch((requestError) => {
        if (active) {
          setResult({ rows: [], total: 0 });
          setError(requestError.message || "Reading register could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, refreshKey, requestParams]);

  const total = Number(result.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const setPageSize = (value) => {
    const nextSize = Number(value);
    setPageSizeValue(pageSizeOptions.includes(nextSize) ? nextSize : 25);
    setPage(1);
  };

  return {
    requestParams,
    end: total ? Math.min((currentPage - 1) * pageSize + result.rows.length, total) : 0,
    error,
    filteredRows: result.rows || [],
    loading,
    page: currentPage,
    pageCount,
    pageSize,
    query,
    setPage,
    setPageSize,
    setQuery: setQueryValue,
    start: total ? (currentPage - 1) * pageSize + 1 : 0,
    total,
    visibleRows: result.rows || []
  };
}
