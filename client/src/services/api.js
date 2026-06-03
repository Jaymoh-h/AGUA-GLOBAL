const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, "");

const getToken = () => localStorage.getItem("agua_token");
let futureDateOverrideHandler = null;

export const setFutureDateOverrideHandler = (handler) => {
  futureDateOverrideHandler = typeof handler === "function" ? handler : null;
  return () => {
    if (futureDateOverrideHandler === handler) {
      futureDateOverrideHandler = null;
    }
  };
};

const shouldPromptForFutureDateOverride = (message, options) =>
  typeof window !== "undefined" &&
  typeof window.prompt === "function" &&
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

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || "Request failed.";
    if (shouldPromptForFutureDateOverride(message, options)) {
      const reason = futureDateOverrideHandler
        ? await futureDateOverrideHandler({ message, path })
        : window.prompt("This date is later than today. Enter the admin override reason to continue:");
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

  return data;
};

export const assetUrl = (path) => {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${ASSET_BASE}${path.startsWith("/") ? path : `/${path}`}`;
};

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  requestPasswordReset: (email) => request("/auth/password-reset/request", { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) =>
    request("/auth/password-reset/confirm", { method: "POST", body: { token, new_password: newPassword } }),
  me: () => request("/auth/me"),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword }
    }),
  dashboard: () => request("/dashboard"),
  reports: {
    summary: () => request("/reports/summary"),
    accountant: (params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/reports/accountant${query.toString() ? `?${query}` : ""}`);
    },
    dataQuality: () => request("/reports/data-quality"),
    backup: () => request("/reports/backup")
  },
  portal: {
    dashboard: (customerId = "") => request(`/portal/dashboard${customerId ? `?customer_id=${customerId}` : ""}`),
    getPayment: (id, customerId = "") => request(`/portal/payments/${id}${customerId ? `?customer_id=${customerId}` : ""}`),
    createServiceRequest: (payload) => request("/portal/service-requests", { method: "POST", body: payload })
  },
  customers: {
    list: () => request("/customers"),
    statement: (id, params = {}) => {
      const query = new URLSearchParams(params);
      return request(`/customers/${id}/statement${query.toString() ? `?${query}` : ""}`);
    },
    previewImport: (csv) => request("/customers/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv) => request("/customers/imports/commit", { method: "POST", body: { csv } }),
    previewOpeningBalanceImport: (csv) =>
      request("/customers/opening-balances/imports/preview", { method: "POST", body: { csv } }),
    commitOpeningBalanceImport: (csv) =>
      request("/customers/opening-balances/imports/commit", { method: "POST", body: { csv } }),
    closeAccount: (id, payload) => request(`/customers/${id}/close`, { method: "POST", body: payload }),
    create: (payload) => request("/customers", { method: "POST", body: payload }),
    update: (id, payload) => request(`/customers/${id}`, { method: "PUT", body: payload }),
    remove: (id) => request(`/customers/${id}`, { method: "DELETE" })
  },
  rates: {
    list: () => request("/rates"),
    create: (payload) => request("/rates", { method: "POST", body: payload }),
    update: (id, payload) => request(`/rates/${id}`, { method: "PUT", body: payload }),
    replaceBlocks: (id, blocks, effectiveFrom = "") =>
      request(`/rates/${id}/blocks`, { method: "PUT", body: { blocks, effective_from: effectiveFrom } })
  },
  zones: {
    list: () => request("/zones"),
    create: (payload) => request("/zones", { method: "POST", body: payload }),
    update: (id, payload) => request(`/zones/${id}`, { method: "PUT", body: payload })
  },
  readings: {
    list: () => request("/readings"),
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
      updateStatus: (id, status, correctionReason = "") =>
        request(`/billing/periods/${id}/status`, { method: "PATCH", body: { status, correction_reason: correctionReason } })
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
      review: (id, payload) =>
        request(`/billing/source-billing-requests/${id}/review`, { method: "PATCH", body: payload })
    }
  },
  businessSettings: {
    public: () => request("/business-settings/public"),
    get: () => request("/business-settings"),
    update: (payload) => request("/business-settings", { method: "PUT", body: payload }),
    uploadLogo: (payload) => request("/business-settings/logo", { method: "POST", body: payload })
  },
  meters: {
    list: (customerId) => request(`/meters?customer_id=${customerId}`),
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
    templates: (medium = "") => request(`/communications/templates${medium ? `?medium=${medium}` : ""}`),
    createTemplate: (payload) => request("/communications/templates", { method: "POST", body: payload }),
    updateTemplate: (id, payload) => request(`/communications/templates/${id}`, { method: "PUT", body: payload }),
    campaigns: () => request("/communications/campaigns"),
    campaign: (id) => request(`/communications/campaigns/${id}`),
    sendInvoiceAlert: (customerId, payload) =>
      request(`/communications/invoice-alerts/${customerId}/send`, { method: "POST", body: payload }),
    bulkSendInvoiceAlerts: (payload) => request("/communications/invoice-alerts/bulk-send", { method: "POST", body: payload })
  },
  payments: {
    list: () => request("/payments"),
    suspense: () => request("/payments/suspense"),
    get: (id) => request(`/payments/${id}`),
    create: (payload) => request("/payments", { method: "POST", body: payload }),
    previewImport: (csv) => request("/payments/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv) => request("/payments/imports/commit", { method: "POST", body: { csv } }),
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
    commitImport: (csv) => request("/expenses/imports/commit", { method: "POST", body: { csv } })
  },
  payroll: {
    payees: () => request("/payroll/payees"),
    createPayee: (payload) => request("/payroll/payees", { method: "POST", body: payload }),
    terminatePayee: (id, payload) => request(`/payroll/payees/${id}/terminate`, { method: "PATCH", body: payload }),
    runs: () => request("/payroll/runs"),
    createRun: (payload) => request("/payroll/runs", { method: "POST", body: payload }),
    getRun: (id) => request(`/payroll/runs/${id}`),
    addRunLineItem: (id, payload) => request(`/payroll/runs/${id}/line-items`, { method: "POST", body: payload }),
    updateRunStatus: (id, payload) => request(`/payroll/runs/${id}/status`, { method: "PATCH", body: payload }),
    updateLineItem: (id, payload) => request(`/payroll/line-items/${id}`, { method: "PATCH", body: payload })
  },
  maintenance: {
    list: (status = "") => request(`/maintenance-requests${status ? `?status=${status}` : ""}`),
    assignees: () => request("/maintenance-requests/assignees"),
    create: (payload) => request("/maintenance-requests", { method: "POST", body: payload }),
    update: (id, payload) => request(`/maintenance-requests/${id}`, { method: "PUT", body: payload }),
    addExpense: (id, payload) => request(`/maintenance-requests/${id}/expenses`, { method: "POST", body: payload }),
    resolve: (id, payload) => request(`/maintenance-requests/${id}/resolve`, { method: "PATCH", body: payload })
  },
  production: {
    meters: () => request("/production/meters"),
    createMeter: (payload) => request("/production/meters", { method: "POST", body: payload }),
    replaceMeter: (id, payload) => request(`/production/meters/${id}/replace`, { method: "POST", body: payload }),
    topups: () => request("/production/electricity-topups"),
    createTopup: (payload) => request("/production/electricity-topups", { method: "POST", body: payload }),
    weeklyReadings: () => request("/production/weekly-readings"),
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
    update: (id, payload) => request(`/users/${id}`, { method: "PUT", body: payload })
  }
};
