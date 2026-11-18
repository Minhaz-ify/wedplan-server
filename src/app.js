import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb } from "./db.js";
import { verifyJWT } from "./middleware.js";
import { publicRouter, vendorRouter, serviceDetailHandler } from "./routes/services.js";
import { customerRouter, vendorBookingsRouter } from "./routes/bookings.js";
import adminRouter from "./routes/admin.js";
import { paymentsRouter, stripeWebhook } from "./routes/payments.js";
import { meRouter, statsHandler } from "./routes/me.js";

const app = express();
const origins = (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((s) => s.trim());

app.use(cors({ origin: origins, allowedHeaders: ["Content-Type", "Authorization"], methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));

// Stripe needs the raw body, so this must come BEFORE express.json()
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json({ limit: "1mb" }));

app.use(async (req, res, next) => {
  try {
    await getDb();
    next();
  } catch (e) {
    next(e);
  }
});

app.get("/", (req, res) => res.json({ ok: true, name: "WedPlan API" }));

app.use("/api/services", publicRouter);
app.get("/api/services/:id", verifyJWT, serviceDetailHandler);
app.use("/api/vendor/services", vendorRouter);
app.use("/api/vendor/bookings", vendorBookingsRouter);
app.use("/api/bookings", customerRouter);
app.use("/api/admin", adminRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/me", meRouter);
app.get("/api/stats", verifyJWT, statsHandler);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : "Internal server error" });
});

export default app;
