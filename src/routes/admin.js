import { Router } from "express";
import { getDb, oid, escapeRegex, attachVendors, isPremium } from "../db.js";
import { verifyJWT, requireRole } from "../middleware.js";

const router = Router();
router.use(verifyJWT, requireRole("admin"));

router.get("/users", async (req, res) => {
  const { q, role } = req.query;
  const filter = {};
  if (role && ["vendor", "customer", "admin"].includes(role)) filter.role = role;
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const db = await getDb();
  const users = await db.collection("user").find(filter).sort({ createdAt: -1 }).limit(200).toArray();
  res.json(
    users.map((u) => ({
      id: u._id.toString(), name: u.name, email: u.email, image: u.image || null, role: u.role || "customer",
      isBlocked: Boolean(u.isBlocked), businessName: u.businessName || null,
      subscriptionPlan: isPremium(u) ? "premium" : "free", subscriptionExpiresAt: u.subscriptionExpiresAt || null, createdAt: u.createdAt,
    }))
  );
});

router.patch("/users/:id/block", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid user ID" });
  const db = await getDb();
  const u = await db.collection("user").findOne({ _id: id });
  if (!u) return res.status(404).json({ message: "User not found" });
  if (u.role === "admin" || id.toString() === req.user.id) return res.status(403).json({ message: "Admin accounts cannot be blocked" });
  const blocked = Boolean(req.body?.blocked);
  await db.collection("user").updateOne({ _id: id }, { $set: { isBlocked: blocked } });
  res.json({ message: blocked ? "User blocked" : "User unblocked" });
});

router.get("/services", async (req, res) => {
  const { q, status, category } = req.query;
  const filter = {};
  if (["pending", "approved", "rejected"].includes(status)) filter.status = status;
  if (category) filter.category = String(category);
  if (q) filter.serviceName = { $regex: escapeRegex(q), $options: "i" };
  const db = await getDb();
  const items = await db.collection("services").find(filter).sort({ createdAt: -1 }).limit(300).toArray();
  res.json(await attachVendors(db, items));
});

router.patch("/services/:id/status", async (req, res) => {
  const id = oid(req.params.id);
  const { status } = req.body || {};
  if (!id) return res.status(400).json({ message: "Invalid service ID" });
  if (!["pending", "approved", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  const db = await getDb();
  const r = await db.collection("services").updateOne({ _id: id }, { $set: { status, reviewedAt: new Date() } });
  if (!r.matchedCount) return res.status(404).json({ message: "Service not found" });
  res.json({ message: `Service ${status}` });
});

router.delete("/services/:id", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid service ID" });
  const db = await getDb();
  const r = await db.collection("services").deleteOne({ _id: id });
  if (!r.deletedCount) return res.status(404).json({ message: "Service not found" });
  await db.collection("bookings").updateMany({ serviceId: id.toString(), status: "pending" }, { $set: { status: "cancelled" } });
  res.json({ message: "Service deleted" });
});

// Read-only on purpose: there is no endpoint to modify payment records.
router.get("/transactions", async (req, res) => {
  const db = await getDb();
  const tx = await db.collection("transactions").find({}).sort({ createdAt: -1 }).limit(300).toArray();
  res.json(await attachVendors(db, tx));
});

export default router;
