const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, "");
export const apiBaseUrl = API_BASE;

let csrfToken = "";
let futureDateOverrideHandler = null;

export const clearSessionState = () => {
  csrfToken = "";
};

const isUnsafeMethod = (method = "GET") => !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());

const rememberCsrfToken = (data) => {
  if (data?.csrf_token) {
    csrfToken = data.csrf_token;
  }
};

export const setFutureDateOverrideHandler = (handler) => {
  futureDateOverrideHandler = typeof handler === "function" ? handler : null;
  return () => {
    if (futureDateOverrideHandler === handler) {
      futureDateOverrideHandler = null;
    }
  };
};

const shouldRequestFutureDateOverride = (message, options) =>
  typeof futureDateOverrideHandler === "function" &&
  /Admin override reason is required/i.test(message || "") &&
  options.body &&
  typeof options.body === "object" &&
  !Array.isArray(options.body) &&
  !options.body.future_date_override_reason &&
  !options.skipFutureDateOverridePrompt;

const request = async (path, options = {}) => {
  const { skipFutureDateOverridePrompt: _skipFutureDateOverridePrompt, ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (csrfToken && isUnsafeMethod(options.method)) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: "include",
    cache: isUnsafeMethod(options.method) ? fetchOptions.cache : "no-store",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSessionState();
    const message = data.message || "Request failed.";
    if (shouldRequestFutureDateOverride(message, options)) {
      const reason = await futureDateOverrideHandler({ message, path });
      if (String(reason || "").trim()) {
        return request(path, {
          ...options,
          body: {
            ...options.body,
            future_date_override_reason: String(reason).trim()
          },
          skipFutureDateOverridePrompt: true
        });
      }
    }
    throw new Error(message);
  }

  rememberCsrfToken(data);
  return data;
};

const requestBlob = async (path) => {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401) clearSessionState();
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Download failed.");
  }
  return response.blob();
};

export const assetUrl = (path) => {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${ASSET_BASE}${path.startsWith("/") ? path : `/${path}`}`;
};

export const api = {
  status: async () => {
    const response = await fetch(`${API_BASE}/status`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "API status check failed.");
      error.data = data;
      throw error;
    }
    return data;
  },
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  selectContext: (contextSelectionToken, accessProfileId) =>
    request("/auth/select-context", {
      method: "POST",
      body: { context_selection_token: contextSelectionToken, access_profile_id: accessProfileId }
    }),
  requestPasswordReset: (email) => request("/auth/password-reset/request", { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) =>
    request("/auth/password-reset/confirm", { method: "POST", body: { token, new_password: newPassword } }),
  me: () => request("/auth/me"),
  contexts: () => request("/auth/contexts"),
  switchContext: (accessProfileId) => request("/auth/switch-context", { method: "POST", body: { access_profile_id: accessProfileId } }),
  logout: () => request("/auth/logout", { method: "POST" }).finally(clearSessionState),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword }
    }),
  dashboard: () => request("/dashboard"),
  documents: {
    list: (entityType, entityId, customerId = "") =>
      request(`/documents?entity_type=${entityType}&entity_id=${entityId}${customerId ? `&customer_id=${encodeURIComponent(customerId)}` : ""}`),
    upload: (payload) => request("/documents", { method: "POST", body: payload }),
    remove: (id, customerId = "") =>
      request(`/documents/${id}${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ""}`, { method: "DELETE" }),
    download: (id, customerId = "") =>
      requestBlob(`/documents/${id}/download${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ""}`)
  },
  knowledgeDocuments: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/knowledge-documents${query.toString() ? `?${query}` : ""}`);
    },
    upload: (payload) => request("/knowledge-documents", { method: "POST", body: payload }),
    update: (id, payload) => request(`/knowledge-documents/${id}`, { method: "PUT", body: payload }),
    remove: (id, reason = "") => request(`/knowledge-documents/${id}`, { method: "DELETE", body: { reason } }),
    download: (id) => requestBlob(`/knowledge-documents/${id}/download`)
  },
  reports: {
    summary: () => request("/reports/summary"),
    accountant: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/reports/accountant${query.toString() ? `?${query}` : ""}`);
    },
    cashFlowForecast: () => request("/reports/cash-flow-forecast"),
    budgetVariance: () => request("/reports/budget-variance"),
    saveMonthlyBudget: (month, payload) => request(`/reports/budget-targets/${encodeURIComponent(month)}`, { method: "PUT", body: payload }),
    dataQuality: () => request("/reports/data-quality"),
    backupStatus: () => request("/reports/backup-status"),
    backupRestoreDrills: () => request("/reports/backup-restore-drills"),
    createBackupRestoreDrill: (payload) => request("/reports/backup-restore-drills", { method: "POST", body: payload }),
    backup: () => request("/reports/backup")
  },
  reminders: {
    preview: () => request("/reminders/operational/preview"),
    sendOperational: (payload = {}) => request("/reminders/operational/send", { method: "POST", body: payload }),
    logs: (limit = 50) => request(`/reminders/operational/logs?limit=${limit}`)
  },
  monitoring: {
    summary: () => request("/monitoring/summary"),
    events: (limit = 100) => request(`/monitoring/events?limit=${limit}`),
    resolveEvent: (id, payload) => request(`/monitoring/events/${id}/resolve`, { method: "PATCH", body: payload }),
    alertSnapshot: () => request("/monitoring/alert-snapshot"),
    sendTestAlert: () => request("/monitoring/test-alert", { method: "POST" }),
    reportClientEvent: (payload) => request("/monitoring/client-events", { method: "POST", body: payload })
  },
  portal: {
    dashboard: (customerId = "") => request(`/portal/dashboard${customerId ? `?customer_id=${customerId}` : ""}`),
    getPayment: (id, customerId = "") => request(`/portal/payments/${id}${customerId ? `?customer_id=${customerId}` : ""}`),
    updateDeliveryPreferences: (payload) => request("/portal/delivery-preferences", { method: "PUT", body: payload }),
    createServiceRequest: (payload) => request("/portal/service-requests", { method: "POST", body: payload }),
    createReadingSubmission: (payload) => request("/portal/reading-submissions", { method: "POST", body: payload })
  },
  customers: {
    list: () => request("/customers"),
    overview: (id) => request(`/customers/${id}/overview`),
    statement: (id, params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/customers/${id}/statement${query.toString() ? `?${query}` : ""}`);
    },
    previewImport: (csv) => request("/customers/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv, reviewNotes) => request("/customers/imports/commit", { method: "POST", body: { csv, review_notes: reviewNotes } }),
    previewOpeningBalanceImport: (csv) =>
      request("/customers/opening-balances/imports/preview", { method: "POST", body: { csv } }),
    commitOpeningBalanceImport: (csv, reviewNotes) =>
      request("/customers/opening-balances/imports/commit", { method: "POST", body: { csv, review_notes: reviewNotes } }),
    closeAccount: (id, payload) => request(`/customers/${id}/close`, { method: "POST", body: payload }),
    create: (payload) => request("/customers", { method: "POST", body: payload }),
    update: (id, payload) => request(`/customers/${id}`, { method: "PUT", body: payload }),
    remove: (id, payload) => request(`/customers/${id}`, { method: "DELETE", body: payload })
  },
  customerServiceCharges: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/customer-service-charges${query.toString() ? `?${query}` : ""}`);
    },
    get: (id) => request(`/customer-service-charges/${id}`),
    create: (payload) => request("/customer-service-charges", { method: "POST", body: payload }),
    waive: (id, reason) => request(`/customer-service-charges/${id}/waive`, { method: "PATCH", body: { reason } }),
    cancel: (id, reason) => request(`/customer-service-charges/${id}/cancel`, { method: "PATCH", body: { reason } })
  },
  paymentArrangements: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/payment-arrangements${query.toString() ? `?${query}` : ""}`);
    },
    create: (payload) => request("/payment-arrangements", { method: "POST", body: payload }),
    declineRequest: (id, reason) => request(`/payment-arrangements/requests/${id}/decline`, { method: "PATCH", body: { reason } }),
    close: (id, payload) => request(`/payment-arrangements/${id}/close`, { method: "PATCH", body: payload })
  },
  standingOrders: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/standing-orders${query.toString() ? `?${query}` : ""}`);
    },
    create: (payload) => request("/standing-orders", { method: "POST", body: payload }),
    updateStatus: (id, payload) => request(`/standing-orders/${id}/status`, { method: "PATCH", body: payload })
  },
  rates: {
    list: () => request("/rates"),
    create: (payload) => request("/rates", { method: "POST", body: payload }),
    update: (id, payload) => request(`/rates/${id}`, { method: "PUT", body: payload }),
    replaceBlocks: (id, blocks, effectiveFrom = "", reviewNotes = "") =>
      request(`/rates/${id}/blocks`, { method: "PUT", body: { blocks, effective_from: effectiveFrom, review_notes: reviewNotes } })
  },
  zones: {
    list: () => request("/zones"),
    create: (payload) => request("/zones", { method: "POST", body: payload }),
    update: (id, payload) => request(`/zones/${id}`, { method: "PUT", body: payload })
  },
  readings: {
    list: () => request("/readings"),
    register: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/readings/register${query.toString() ? `?${query}` : ""}`);
    },
    registerAll: async (params = {}) => {
      const limit = 100;
      const firstPage = await api.readings.register({ ...params, limit, offset: 0 });
      const rows = [...(firstPage.rows || [])];
      for (let offset = rows.length; offset < Number(firstPage.total || 0); offset += limit) {
        const page = await api.readings.register({ ...params, limit, offset });
        rows.push(...(page.rows || []));
      }
      return rows;
    },
    customerSubmissions: () => request("/readings/customer-submissions"),
    reviewCustomerSubmission: (id, payload) =>
      request(`/readings/customer-submissions/${id}/review`, { method: "POST", body: payload }),
    anomalies: (periodStart = "") =>
      request(`/readings/anomalies${periodStart ? `?period_start=${periodStart}` : ""}`),
    estimationCandidates: (periodStart = "") =>
      request(`/readings/estimation-candidates${periodStart ? `?period_start=${periodStart}` : ""}`),
    eligibleCustomers: (periodStart = "") =>
      request(`/readings/eligible-customers${periodStart ? `?period_start=${periodStart}` : ""}`),
    context: (customerId, readingDate, meterId = "") =>
      request(
        `/readings/context?customer_id=${customerId}&reading_date=${readingDate}${meterId ? `&meter_id=${meterId}` : ""}`
      ),
    create: (payload) => request("/readings", { method: "POST", body: payload }),
    previewImport: (csv) => request("/readings/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv, correctionReason = "") =>
      request("/readings/imports/commit", { method: "POST", body: { csv, correction_reason: correctionReason } }),
    update: (id, payload) => request(`/readings/${id}`, { method: "PUT", body: payload })
  },
  bills: {
    list: (status = "") => request(`/bills${status ? `?status=${status}` : ""}`),
    get: (id) => request(`/bills/${id}`),
    promote: (id, payload) => request(`/bills/${id}/promote`, { method: "PATCH", body: payload }),
    sendEmail: (id) => request(`/bills/${id}/email`, { method: "POST" }),
    sendSms: (id) => request(`/bills/${id}/sms`, { method: "POST" }),
    markStatus: (id, status, correctionReason = "") =>
      request(`/bills/${id}/status`, { method: "PATCH", body: { status, correction_reason: correctionReason } })
  },
  billing: {
    periods: {
      list: () => request("/billing/periods"),
      create: (payload) => request("/billing/periods", { method: "POST", body: payload }),
      readiness: (id) => request(`/billing/periods/${id}/readiness`),
      revenueAssurance: (id) => request(`/billing/periods/${id}/revenue-assurance`),
      updateStatus: (id, status, { correctionReason = "", reviewNotes = "" } = {}) =>
        request(`/billing/periods/${id}/status`, {
          method: "PATCH",
          body: { status, correction_reason: correctionReason, review_notes: reviewNotes }
        })
    },
    settings: {
      get: () => request("/billing/settings"),
      update: (payload) => request("/billing/settings", { method: "PUT", body: payload })
    },
    penalties: {
      list: () => request("/billing/penalties"),
      preview: (applicationDate = "") =>
        request(`/billing/penalties/preview${applicationDate ? `?application_date=${applicationDate}` : ""}`),
      apply: (payload) => request("/billing/penalties/apply", { method: "POST", body: payload }),
      waive: (id, payload) => request(`/billing/penalties/${id}/waive`, { method: "PATCH", body: payload }),
      reapply: (id, payload) => request(`/billing/penalties/${id}/reapply`, { method: "PATCH", body: payload })
    },
    sourceBillingRequests: {
      list: () => request("/billing/source-billing-requests"),
      workspace: (periodStart = "") =>
        request(`/billing/source-billing-workspace${periodStart ? `?period_start=${periodStart}` : ""}`),
      review: (id, payload) =>
        request(`/billing/source-billing-requests/${id}/review`, { method: "PATCH", body: payload })
    }
  },
  businessSettings: {
    public: () => request("/business-settings/public"),
    get: () => request("/business-settings"),
    integrationReadiness: () => request("/business-settings/integration-readiness"),
    commissioningChecks: () => request("/business-settings/commissioning-checks"),
    recordCommissioningCheck: (payload) => request("/business-settings/commissioning-checks", { method: "POST", body: payload }),
    update: (payload) => request("/business-settings", { method: "PUT", body: payload }),
    uploadLogo: (payload) => request("/business-settings/logo", { method: "POST", body: payload })
  },
  meters: {
    list: (customerId) => request(`/meters?customer_id=${customerId}`),
    search: (query) => request(`/meters/search?search=${encodeURIComponent(query)}`),
    events: (customerId = "") => request(`/meters/events${customerId ? `?customer_id=${customerId}` : ""}`),
    create: (payload) => request("/meters", { method: "POST", body: payload }),
    replace: (payload) => request("/meters/replace", { method: "POST", body: payload }),
    updateEvent: (id, payload) => request(`/meters/events/${id}`, { method: "PUT", body: payload })
  },
  auditEvents: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/audit-events${query.toString() ? `?${query}` : ""}`);
    }
  },
  adjustments: {
    list: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/adjustments${query.toString() ? `?${query}` : ""}`);
    },
    create: (payload) => request("/adjustments", { method: "POST", body: payload }),
    review: (id, payload) => request(`/adjustments/${id}/review`, { method: "PATCH", body: payload })
  },
  communications: {
    invoicePreview: () => request("/communications/invoice-preview"),
    arrearsFollowUp: (limit = 100, offset = 0) =>
      request(`/communications/arrears-follow-up?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
    paymentPlanFollowUp: () => request("/communications/payment-plan-follow-up"),
    standingOrderFollowUp: () => request("/communications/standing-order-follow-up"),
    disconnectionWarningFollowUp: () => request("/communications/disconnection-warning-follow-up"),
    templates: (medium = "", alertType = "invoice_alert") => {
      const query = new URLSearchParams({ alert_type: alertType });
      if (medium) query.set("medium", medium);
      return request(`/communications/templates?${query}`);
    },
    createTemplate: (payload) => request("/communications/templates", { method: "POST", body: payload }),
    updateTemplate: (id, payload) => request(`/communications/templates/${id}`, { method: "PUT", body: payload }),
    campaigns: () => request("/communications/campaigns"),
    deliveryExceptions: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/communications/delivery-exceptions${query.toString() ? `?${query}` : ""}`);
    },
    campaign: (id) => request(`/communications/campaigns/${id}`),
    sendInvoiceAlert: (customerId, payload) =>
      request(`/communications/invoice-alerts/${customerId}/send`, { method: "POST", body: payload }),
    sendPaymentPlanAlert: (arrangementId, payload) =>
      request(`/communications/payment-plan-alerts/${arrangementId}/send`, { method: "POST", body: payload }),
    sendStandingOrderAlert: (standingOrderId, payload) =>
      request(`/communications/standing-order-alerts/${standingOrderId}/send`, { method: "POST", body: payload }),
    sendDisconnectionWarning: (customerId, payload) =>
      request(`/communications/disconnection-warnings/${customerId}/send`, { method: "POST", body: payload }),
    bulkSendInvoiceAlerts: (payload) => request("/communications/invoice-alerts/bulk-send", { method: "POST", body: payload })
  },
  payments: {
    list: () => request("/payments"),
    register: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/payments/register${query.toString() ? `?${query}` : ""}`);
    },
    registerAll: async (params = {}) => {
      const limit = 100;
      const firstPage = await api.payments.register({ ...params, limit, offset: 0 });
      const rows = [...(firstPage.rows || [])];
      for (let offset = rows.length; offset < Number(firstPage.total || 0); offset += limit) {
        const page = await api.payments.register({ ...params, limit, offset });
        rows.push(...(page.rows || []));
      }
      return rows;
    },
    corrections: (limit = 12) => request(`/payments/corrections?limit=${encodeURIComponent(limit)}`),
    importBatches: (limit = 12) => request(`/payments/imports/recent?limit=${encodeURIComponent(limit)}`),
    mpesaStatus: () => request("/payments/mpesa/status"),
    mpesaCallbackEvents: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/payments/mpesa/callback-events${query.toString() ? `?${query}` : ""}`);
    },
    importMappingProfiles: (channel = "") =>
      request(`/payments/import-mapping-profiles${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`),
    saveImportMappingProfile: (payload) => request("/payments/import-mapping-profiles", { method: "POST", body: payload }),
    suspense: () => request("/payments/suspense"),
    get: (id) => request(`/payments/${id}`),
    create: (payload) => request("/payments", { method: "POST", body: payload }),
    previewImport: (csv) => request("/payments/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv, sourceName = "", reconciliationExclusions = []) =>
      request("/payments/imports/commit", {
        method: "POST",
        body: { csv, source_name: sourceName, reconciliation_exclusions: reconciliationExclusions }
      }),
    update: (id, payload) => request(`/payments/${id}`, { method: "PUT", body: payload }),
    sendReceiptEmail: (id) => request(`/payments/${id}/email`, { method: "POST" }),
    sendReceiptSms: (id) => request(`/payments/${id}/sms`, { method: "POST" }),
    voidToSuspense: (id, payload) => request(`/payments/${id}/void`, { method: "POST", body: payload }),
    reapplySuspense: (id, payload) => request(`/payments/suspense/${id}/reapply`, { method: "POST", body: payload }),
    discardSuspense: (id, payload) => request(`/payments/suspense/${id}/discard`, { method: "POST", body: payload })
  },
  expenses: {
    list: () => request("/expenses"),
    create: (payload) => request("/expenses", { method: "POST", body: payload }),
    previewImport: (csv) => request("/expenses/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv, reviewNotes) => request("/expenses/imports/commit", { method: "POST", body: { csv, review_notes: reviewNotes } })
  },
  contractorInvoices: {
    contractors: () => request("/contractor-invoices/contractors"),
    createContractor: (payload) => request("/contractor-invoices/contractors", { method: "POST", body: payload }),
    updateContractor: (id, payload) => request(`/contractor-invoices/contractors/${id}`, { method: "PUT", body: payload }),
    invoices: () => request("/contractor-invoices/invoices"),
    createInvoice: (payload) => request("/contractor-invoices/invoices", { method: "POST", body: payload }),
    updateInvoice: (id, payload) => request(`/contractor-invoices/invoices/${id}`, { method: "PUT", body: payload }),
    updateStatus: (id, payload) =>
      request(`/contractor-invoices/invoices/${id}/status`, { method: "PATCH", body: payload }),
    postExpense: (id, payload) =>
      request(`/contractor-invoices/invoices/${id}/post-expense`, { method: "POST", body: payload })
  },
  payroll: {
    payees: () => request("/payroll/payees"),
    createPayee: (payload) => request("/payroll/payees", { method: "POST", body: payload }),
    updatePayee: (id, payload) => request(`/payroll/payees/${id}`, { method: "PATCH", body: payload }),
    terminatePayee: (id, payload) => request(`/payroll/payees/${id}/terminate`, { method: "PATCH", body: payload }),
    runs: () => request("/payroll/runs"),
    createRun: (payload) => request("/payroll/runs", { method: "POST", body: payload }),
    getRun: (id) => request(`/payroll/runs/${id}`),
    addRunLineItem: (id, payload) => request(`/payroll/runs/${id}/line-items`, { method: "POST", body: payload }),
    updateRunStatus: (id, payload) => request(`/payroll/runs/${id}/status`, { method: "PATCH", body: payload }),
    downloadPayslip: (lineId) => requestBlob(`/payroll/line-items/${lineId}/payslip`),
    updateLineItem: (id, payload) => request(`/payroll/line-items/${id}`, { method: "PATCH", body: payload })
  },
  maintenance: {
    list: (status = "") => request(`/maintenance-requests${status ? `?status=${status}` : ""}`),
    assignees: () => request("/maintenance-requests/assignees"),
    create: (payload) => request("/maintenance-requests", { method: "POST", body: payload }),
    dispatchBatch: (payload) => request("/maintenance-requests/dispatch", { method: "PUT", body: payload }),
    update: (id, payload) => request(`/maintenance-requests/${id}`, { method: "PUT", body: payload }),
    addExpense: (id, payload) => request(`/maintenance-requests/${id}/expenses`, { method: "POST", body: payload }),
    resolve: (id, payload) => request(`/maintenance-requests/${id}/resolve`, { method: "PATCH", body: payload })
  },
  production: {
    meters: () => request("/production/meters"),
    createMeter: (payload) => request("/production/meters", { method: "POST", body: payload }),
    updateMeter: (id, payload) => request(`/production/meters/${id}`, { method: "PATCH", body: payload }),
    replaceMeter: (id, payload) => request(`/production/meters/${id}/replace`, { method: "POST", body: payload }),
    topups: () => request("/production/electricity-topups"),
    createTopup: (payload) => request("/production/electricity-topups", { method: "POST", body: payload }),
    weeklyReadings: () => request("/production/weekly-readings"),
    readingContext: (readingDate) => request(`/production/reading-context?reading_date=${readingDate}`),
    getWeeklyReading: (id) => request(`/production/weekly-readings/${id}`),
    createWeeklyReading: (payload) => request("/production/weekly-readings", { method: "POST", body: payload }),
    updateWeeklyReading: (id, payload) => request(`/production/weekly-readings/${id}`, { method: "PUT", body: payload }),
    rollbackWeeklyReading: (id, payload) => request(`/production/weekly-readings/${id}`, { method: "DELETE", body: payload }),
    report: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/production/report${query.toString() ? `?${query}` : ""}`);
    }
  },
  users: {
    list: () => request("/users"),
    create: (payload) => request("/users", { method: "POST", body: payload }),
    update: (id, payload) => request(`/users/${id}`, { method: "PUT", body: payload }),
    createAccessProfile: (id, payload) => request(`/users/${id}/access-profiles`, { method: "POST", body: payload }),
    updateAccessProfile: (id, profileId, payload) =>
      request(`/users/${id}/access-profiles/${profileId}`, { method: "PATCH", body: payload }),
    detachAccessProfile: (id, profileId, reviewNotes) =>
      request(`/users/${id}/access-profiles/${profileId}`, { method: "DELETE", body: { review_notes: reviewNotes } })
  }
};
