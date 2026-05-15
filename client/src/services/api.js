const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),
  dashboard: () => request("/dashboard"),
  customers: {
    list: () => request("/customers"),
    create: (payload) => request("/customers", { method: "POST", body: payload }),
    update: (id, payload) => request(`/customers/${id}`, { method: "PUT", body: payload }),
    remove: (id) => request(`/customers/${id}`, { method: "DELETE" })
  },
  rates: {
    list: () => request("/rates"),
    create: (payload) => request("/rates", { method: "POST", body: payload }),
    update: (id, payload) => request(`/rates/${id}`, { method: "PUT", body: payload })
  },
  zones: {
    list: () => request("/zones"),
    create: (payload) => request("/zones", { method: "POST", body: payload }),
    update: (id, payload) => request(`/zones/${id}`, { method: "PUT", body: payload })
  },
  readings: {
    list: () => request("/readings"),
    create: (payload) => request("/readings", { method: "POST", body: payload }),
    update: (id, payload) => request(`/readings/${id}`, { method: "PUT", body: payload })
  },
  bills: {
    list: (status = "") => request(`/bills${status ? `?status=${status}` : ""}`),
    markStatus: (id, status) => request(`/bills/${id}/status`, { method: "PATCH", body: { status } })
  },
  payments: {
    list: () => request("/payments"),
    create: (payload) => request("/payments", { method: "POST", body: payload }),
    update: (id, payload) => request(`/payments/${id}`, { method: "PUT", body: payload })
  },
  users: {
    list: () => request("/users"),
    create: (payload) => request("/users", { method: "POST", body: payload }),
    update: (id, payload) => request(`/users/${id}`, { method: "PUT", body: payload })
  }
};
