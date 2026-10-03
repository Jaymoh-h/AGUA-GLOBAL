import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

const canReviewSourceBilling = (role) => ["admin", "accountant"].includes(role);

export default function useReadingsWorkspaceData({ role, readingDate, sourceReadingDate }) {
  const [customers, setCustomers] = useState([]);
  const [readings, setReadings] = useState([]);
  const [readingEligibility, setReadingEligibility] = useState(null);
  const [eligibleReadingCustomers, setEligibleReadingCustomers] = useState([]);
  const [meterEvents, setMeterEvents] = useState([]);
  const [sourceRequests, setSourceRequests] = useState([]);
  const [sourceWorkspace, setSourceWorkspace] = useState({ period: null, rows: [] });
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");

  const load = useCallback(
    async ({ showState = false } = {}) => {
      if (showState) {
        setInitialLoading(true);
        setInitialError("");
      }
      try {
        const sourceBillingAccess = canReviewSourceBilling(role);
        const [customerRows, readingRows, eligibility, eventRows, sourceRows, sourceWorkspaceRows] = await Promise.all([
          api.customers.list(),
          api.readings.list(),
          api.readings.eligibleCustomers(readingDate),
          api.meters.events(),
          sourceBillingAccess ? api.billing.sourceBillingRequests.list() : Promise.resolve([]),
          sourceBillingAccess
            ? api.billing.sourceBillingRequests.workspace(sourceReadingDate)
            : Promise.resolve({ period: null, rows: [] })
        ]);
        setCustomers(customerRows);
        setReadings(readingRows);
        setReadingEligibility(eligibility);
        setEligibleReadingCustomers(eligibility.rows || []);
        setMeterEvents(eventRows);
        setSourceRequests(sourceRows);
        setSourceWorkspace(sourceWorkspaceRows);
      } catch (error) {
        if (showState) setInitialError(error.message || "Meter readings and field controls could not be loaded.");
        throw error;
      } finally {
        if (showState) setInitialLoading(false);
      }
    },
    [readingDate, role, sourceReadingDate]
  );

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  return {
    customers,
    eligibleReadingCustomers,
    initialError,
    initialLoading,
    load,
    meterEvents,
    readingEligibility,
    readings,
    setEligibleReadingCustomers,
    setReadingEligibility,
    setSourceWorkspace,
    sourceRequests,
    sourceWorkspace
  };
}
