const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { clientOrigin } = require("./config/env");
const errorHandler = require("./middleware/errorHandler");
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

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "agua-global-api" });
});

app.use("/api/auth", authRoutes);
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

app.use(errorHandler);

module.exports = app;
