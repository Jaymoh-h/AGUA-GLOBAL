import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

/** @typedef {import("../contracts/workflows").MpesaCallbackFilters} MpesaCallbackFilters */

const callbackQuery = (filters = {}) => {
  const status = ["posted", "duplicate", "rejected"].includes(filters.status) ? filters.status : "";
  const limit = [20, 50, 100].includes(Number(filters.limit)) ? Number(filters.limit) : 20;
  return { status, limit };
};

const mappingProfilesByChannel = (profiles) =>
  profiles.reduce(
    (grouped, profile) => ({
      ...grouped,
      [profile.payment_channel]: {
        ...(grouped[profile.payment_channel] || {}),
        [profile.name]: profile.mapping || {}
      }
    }),
    { bank: {}, mpesa_paybill: {} }
  );

/** @param {{ mpesaCallbackFilters: MpesaCallbackFilters }} options */
export default function usePaymentsWorkspaceData({ mpesaCallbackFilters }) {
  const [payments, setPayments] = useState([]);
  const [paymentCorrections, setPaymentCorrections] = useState([]);
  const [paymentImportBatches, setPaymentImportBatches] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(true);
  const [suspenseItems, setSuspenseItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [standingOrders, setStandingOrders] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [bankMappingProfiles, setBankMappingProfiles] = useState({ bank: {}, mpesa_paybill: {} });
  const [mpesaIntegration, setMpesaIntegration] = useState(null);
  const [mpesaCallbackEvents, setMpesaCallbackEvents] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");

  const load = useCallback(
    async ({ showState = false } = {}) => {
      if (showState) {
        setInitialLoading(true);
        setInitialError("");
      }
      setCorrectionsLoading(true);
      const { status, limit } = callbackQuery(mpesaCallbackFilters);
      try {
        const [paymentRows, correctionRows, importBatchRows, suspenseRows, customerRows, businessRow, adjustmentRows, mappingProfileRows, mpesaStatus, mpesaEventRows, standingOrderRows] = await Promise.all([
          api.payments.list(),
          api.payments.corrections(),
          api.payments.importBatches(),
          api.payments.suspense(),
          api.customers.list(),
          api.businessSettings.get(),
          api.adjustments.list(),
          api.payments.importMappingProfiles(),
          api.payments.mpesaStatus(),
          api.payments.mpesaCallbackEvents({ limit, ...(status ? { status } : {}) }),
          api.standingOrders.list({ status: "active" })
        ]);
        setPayments(paymentRows);
        setPaymentCorrections(correctionRows);
        setPaymentImportBatches(importBatchRows);
        setSuspenseItems(suspenseRows);
        setCustomers(customerRows);
        setStandingOrders(standingOrderRows);
        setBusinessSettings(businessRow);
        setAdjustments(adjustmentRows);
        setMpesaIntegration(mpesaStatus);
        setMpesaCallbackEvents(mpesaEventRows);
        setBankMappingProfiles(mappingProfilesByChannel(mappingProfileRows));
      } catch (error) {
        if (showState) setInitialError(error.message || "Payments, suspense, and reconciliation controls could not be loaded.");
        throw error;
      } finally {
        setCorrectionsLoading(false);
        if (showState) setInitialLoading(false);
      }
    },
    [mpesaCallbackFilters]
  );

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  const refreshMpesaCallbackEvents = useCallback(async (nextFilters = mpesaCallbackFilters) => {
    const { status, limit } = callbackQuery(nextFilters);
    const events = await api.payments.mpesaCallbackEvents({ limit, ...(status ? { status } : {}) });
    setMpesaCallbackEvents(events);
  }, [mpesaCallbackFilters]);

  return {
    adjustments,
    bankMappingProfiles,
    businessSettings,
    correctionsLoading,
    customers,
    initialError,
    initialLoading,
    load,
    mpesaCallbackEvents,
    mpesaIntegration,
    paymentCorrections,
    paymentImportBatches,
    payments,
    refreshMpesaCallbackEvents,
    setBankMappingProfiles,
    standingOrders,
    suspenseItems
  };
}
