import { useCallback, useState } from "react";
import { api } from "../services/api";

/** @typedef {import("../contracts/workflows").ReportDateRange} ReportDateRange */

export default function useReportsWorkspaceData() {
  const [data, setData] = useState(null);
  const [accountantData, setAccountantData] = useState(null);
  const [productionReport, setProductionReport] = useState(null);
  const [cashFlowForecast, setCashFlowForecast] = useState(null);
  const [budgetVariance, setBudgetVariance] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [accountantLoading, setAccountantLoading] = useState(true);
  const [accountantMessage, setAccountantMessage] = useState("");
  const [dataQuality, setDataQuality] = useState([]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const [summary, forecast, variance, quality, settings] = await Promise.all([
        api.reports.summary(),
        api.reports.cashFlowForecast().catch(() => null),
        api.reports.budgetVariance().catch(() => null),
        api.reports.dataQuality().catch(() => []),
        api.businessSettings.get().catch(() => null)
      ]);
      setData(summary);
      setCashFlowForecast(forecast);
      setBudgetVariance(variance);
      setDataQuality(quality);
      setBusinessSettings(settings);
    } catch (error) {
      setSummaryError(error.message || "The management reporting summary could not be loaded.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  /** @param {ReportDateRange} filters */
  const loadAccountantReports = useCallback(async (filters) => {
    setAccountantMessage("");
    setAccountantLoading(true);
    try {
      const [nextAccountantData, nextProductionReport] = await Promise.all([
        api.reports.accountant(filters),
        api.production.report({ from: filters.start_date, to: filters.end_date })
      ]);
      setAccountantData(nextAccountantData);
      setProductionReport(nextProductionReport);
    } catch (error) {
      setAccountantMessage(error.message || "The accountant reporting dataset could not be loaded.");
    } finally {
      setAccountantLoading(false);
    }
  }, []);

  return {
    accountantData,
    accountantLoading,
    accountantMessage,
    budgetVariance,
    businessSettings,
    cashFlowForecast,
    data,
    dataQuality,
    loadAccountantReports,
    loadSummary,
    productionReport,
    setBudgetVariance,
    summaryError,
    summaryLoading
  };
}
