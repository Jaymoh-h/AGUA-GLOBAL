const express = require("express");
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

const app = express();

app.use(helmet());
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

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

app.use(errorHandler);

module.exports = app;
