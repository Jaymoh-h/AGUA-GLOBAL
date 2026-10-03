import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const pageSizeOptions = [10, 25, 50, 100];

export default function usePaymentHistory({ filters, focusKey, refreshKey }) {
  const [query, setQueryValue] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeValue] = useState(25);
  const [result, setResult] = useState({ rows: [], total: 0, summary: { received_total: 0, credit_total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query);
  const creditsOnly = focusKey === "customer_credits";
  const requestParams = useMemo(
    () => ({
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
      ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
      ...(deferredQuery.trim() ? { search: deferredQuery.trim() } : {}),
      ...(creditsOnly ? { credits_only: "true" } : {})
    }),
    [creditsOnly, deferredQuery, filters.channel, filters.dateFrom, filters.dateTo]
  );

  useEffect(() => {
    setPage(1);
  }, [creditsOnly, filters.channel, filters.dateFrom, filters.dateTo, deferredQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.payments
      .register({ ...requestParams, limit: pageSize, offset: (page - 1) * pageSize })
      .then((nextResult) => {
        if (active) setResult(nextResult);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Payment history could not be loaded.");
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
    creditTotal: Number(result.summary?.credit_total || 0),
    error,
    historyTotal: Number(result.summary?.received_total || 0),
    loading,
    requestParams,
    table: {
      end: total ? Math.min((currentPage - 1) * pageSize + result.rows.length, total) : 0,
      filteredRows: result.rows || [],
      page: currentPage,
      pageCount,
      pageSize,
      loading,
      query,
      setPage,
      setPageSize,
      setQuery: setQueryValue,
      start: total ? (currentPage - 1) * pageSize + 1 : 0,
      total,
      visibleRows: result.rows || []
    }
  };
}
