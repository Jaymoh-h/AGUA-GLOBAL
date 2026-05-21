const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, "");

const getToken = () => localStorage.getItem("agua_token");

const request = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
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
    }
  },
  portal: {
    dashboard: () => request("/portal/dashboard"),
    getPayment: (id) => request(`/portal/payments/${id}`),
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
    replaceBlocks: (id, blocks) => request(`/rates/${id}/blocks`, { method: "PUT", body: { blocks } })
  },
  zones: {
    list: () => request("/zones"),
    create: (payload) => request("/zones", { method: "POST", body: payload }),
    update: (id, payload) => request(`/zones/${id}`, { method: "PUT", body: payload })
  },
  readings: {
    list: () => request("/readings"),
    context: (customerId, readingDate) =>
      request(`/readings/context?customer_id=${customerId}&reading_date=${readingDate}`),
    create: (payload) => request("/readings", { method: "POST", body: payload }),
    previewImport: (csv) => request("/readings/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv, correctionReason = "") =>
      request("/readings/imports/commit", { method: "POST", body: { csv, correction_reason: correctionReason } }),
    update: (id, payload) => request(`/readings/${id}`, { method: "PUT", body: payload })
  },
  bills: {
    list: (status = "") => request(`/bills${status ? `?status=${status}` : ""}`),
    get: (id) => request(`/bills/${id}`),
    markStatus: (id, status, correctionReason = "") =>
      request(`/bills/${id}/status`, { method: "PATCH", body: { status, correction_reason: correctionReason } })
  },
  billing: {
    periods: {
      list: () => request("/billing/periods"),
      create: (payload) => request("/billing/periods", { method: "POST", body: payload }),
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
      waive: (id, payload) => request(`/billing/penalties/${id}/waive`, { method: "PATCH", body: payload })
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
    replace: (payload) => request("/meters/replace", { method: "POST", body: payload })
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
  payments: {
    list: () => request("/payments"),
    get: (id) => request(`/payments/${id}`),
    create: (payload) => request("/payments", { method: "POST", body: payload }),
    previewImport: (csv) => request("/payments/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv) => request("/payments/imports/commit", { method: "POST", body: { csv } }),
    update: (id, payload) => request(`/payments/${id}`, { method: "PUT", body: payload })
  },
  expenses: {
    list: () => request("/expenses"),
    create: (payload) => request("/expenses", { method: "POST", body: payload }),
    previewImport: (csv) => request("/expenses/imports/preview", { method: "POST", body: { csv } }),
    commitImport: (csv) => request("/expenses/imports/commit", { method: "POST", body: { csv } })
  },
  maintenance: {
    list: (status = "") => request(`/maintenance-requests${status ? `?status=${status}` : ""}`),
    assignees: () => request("/maintenance-requests/assignees"),
    create: (payload) => request("/maintenance-requests", { method: "POST", body: payload }),
    update: (id, payload) => request(`/maintenance-requests/${id}`, { method: "PUT", body: payload }),
    resolve: (id, payload) => request(`/maintenance-requests/${id}/resolve`, { method: "PATCH", body: payload })
  },
  users: {
    list: () => request("/users"),
    create: (payload) => request("/users", { method: "POST", body: payload }),
    update: (id, payload) => request(`/users/${id}`, { method: "PUT", body: payload })
  }
};
