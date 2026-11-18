import { Router } from "express";
import { getDb, isPremium } from "../db.js";
import { verifyJWT } from "../middleware.js";

export const meRouter = Router();
meRouter.use(verifyJWT);

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, image: u.image || null, role: u.role, businessName: u.businessName || null,
  subscriptionPlan: isPremium(u) ? "premium" : "free", subscriptionExpiresAt: u.subscriptionExpiresAt || null,
});

meRouter.get("/", (req, res) => res.json(publicUser(req.user)));

// Only whitelisted fields: role / subscription / isBlocked can never be changed here.
meRouter.patch("/", async (req, res) => {
  const { name, image, businessName } = req.body || {};
  const set = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) return res.status(400).json({ message: "Name must be at least 2 characters" });
    set.name = name.trim();
  }
  if (image !== undefined) {
    if (image && !/^https?:\/\//.test(image)) return res.status(400).json({ message: "Invalid image URL" });
    set.image = image || null;
  }
  if (businessName !== undefined && req.user.role === "vendor") set.businessName = String(businessName).trim().slice(0, 100);
  if (!Object.keys(set).length) return res.status(400).json({ message: "Nothing to update" });
  set.updatedAt = new Date();
  const db = await getDb();
  await db.collection("user").updateOne({ _id: req.user._id }, { $set: set });
  res.json({ message: "Profile updated", user: publicUser({ ...req.user, ...set }) });
});

export async function statsHandler(req, res) {
  const db = await getDb();
  const u = req.user;
  const count = (col, f) => db.collection(col).countDocuments(f);
  if (u.role === "vendor") {
    const [totalServices, activeServices, pendingRequests, acceptedBookings] = await Promise.all([
      count("services", { vendorId: u.id }),
      count("services", { vendorId: u.id, status: "approved", isActive: { $ne: false } }),
      count("bookings", { vendorId: u.id, status: "pending" }),
      count("bookings", { vendorId: u.id, status: "accepted" }),
    ]);
    return res.json({ totalServices, activeServices, pendingRequests, acceptedBookings, plan: isPremium(u) ? "premium" : "free" });
  }
  if (u.role === "customer") {
    const [total, pending, accepted, rejected] = await Promise.all(
      ["", "pending", "accepted", "rejected"].map((s) => count("bookings", { customerId: u.id, ...(s && { status: s }) }))
    );
    return res.json({ total, pending, accepted, rejected });
  }
  const [totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions] = await Promise.all([
    count("user", {}), count("user", { role: "vendor" }), count("user", { role: "customer" }),
    count("services", {}), count("services", { status: "pending" }), count("transactions", {}),
  ]);
  res.json({ totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions });
}
