const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const {
  apiRateLimitMax,
  apiRateLimitStore,
  apiRateLimitWindowMs,
  authRateLimitMax,
  authRateLimitStore,
  authRateLimitWindowMs,
  clientOrigins,
  rateLimitHashSecret
} = require("./config/env");
const pool = require("./db/pool");
const errorHandler = require("./middleware/errorHandler");
const { createRateLimiter } = require("./middleware/rateLimit");
const authRoutes = require("./routes/auth.routes");
const customerRoutes = require("./routes/customer.routes");
const readingRoutes = require("./routes/reading.routes");
const billRoutes = require("./routes/bill.routes");
const paymentRoutes = require("./routes/payment.routes");
const userRoutes = require("./routes/user.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const rateRoutes = require("./routes/rate.routes");
const zoneRoutes = require("./routes/zone.routes");
const billingRoutes = require("./routes/billing.routes");
const meterRoutes = require("./routes/meter.routes");
const auditRoutes = require("./routes/audit.routes");
const reportRoutes = require("./routes/report.routes");
const expenseRoutes = require("./routes/expense.routes");
const businessSettingsRoutes = require("./routes/businessSettings.routes");
const maintenanceRoutes = require("./routes/maintenance.routes");
const portalRoutes = require("./routes/portal.routes");
const adjustmentRoutes = require("./routes/adjustment.routes");
const productionRoutes = require("./routes/production.routes");
const payrollRoutes = require("./routes/payroll.routes");
const communicationRoutes = require("./routes/communication.routes");
const documentRoutes = require("./routes/document.routes");
const contractorInvoiceRoutes = require("./routes/contractorInvoice.routes");
const knowledgeDocumentRoutes = require("./routes/knowledgeDocument.routes");
const operationalReminderRoutes = require("./routes/operationalReminder.routes");
const monitoringRoutes = require("./routes/monitoring.routes");
const { recordSystemEvent } = require("./services/systemEvent.service");

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || clientOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));

const apiRateLimiter = createRateLimiter({
  windowMs: apiRateLimitWindowMs,
  max: apiRateLimitMax,
  message: "Too many API requests. Please try again shortly.",
  store: apiRateLimitStore,
  scope: "api",
  pool,
  hashSecret: rateLimitHashSecret
});

const authRateLimiter = createRateLimiter({
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  message: "Too many authentication attempts. Please wait before trying again.",
  store: authRateLimitStore,
  scope: "auth",
  pool,
  hashSecret: rateLimitHashSecret,
  keyGenerator: (req) => {
    const identifier = String(req.body?.email || req.body?.token || req.ip || "").trim().toLowerCase();
    return `${req.ip || "unknown"}:${req.path}:${identifier}`;
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "agua-global-api" });
});

app.get("/api/status", async (req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "agua-global-api",
      api: "ok",
      database: "ok",
      response_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    recordSystemEvent({
      eventType: "database.status_check_failed",
      severity: "error",
      source: "database",
      message: "Database status check failed.",
      details: {
        code: error.code || null,
        message: error.message
      },
      req,
      statusCode: 503
    });
    res.status(503).json({
      status: "degraded",
      service: "agua-global-api",
      api: "ok",
      database: "error",
      response_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString(),
      message: "Database check failed."
    });
  }
});

app.use("/api", apiRateLimiter);
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/rates", rateRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/meters", meterRoutes);
app.use("/api/audit-events", auditRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/business-settings", businessSettingsRoutes);
app.use("/api/maintenance-requests", maintenanceRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/adjustments", adjustmentRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/communications", communicationRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/contractor-invoices", contractorInvoiceRoutes);
app.use("/api/knowledge-documents", knowledgeDocumentRoutes);
app.use("/api/reminders", operationalReminderRoutes);
app.use("/api/monitoring", monitoringRoutes);

app.use(errorHandler);

module.exports = app;
