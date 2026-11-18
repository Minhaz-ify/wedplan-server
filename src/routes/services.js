import { Router } from "express";
import { getDb, oid, CATEGORIES, escapeRegex, attachVendors, isPremium } from "../db.js";
import { verifyJWT, requireRole } from "../middleware.js";

export const publicRouter = Router();
export const vendorRouter = Router();

const FREE_LIMIT = 3;

// ---------- Public: approved + active services only ----------
publicRouter.get("/", async (req, res) => {
  const db = await getDb();
  const { q, category, location, sort, page = 1, limit = 12 } = req.query;
  const filter = { status: "approved", isActive: { $ne: false } };
  if (q) filter.serviceName = { $regex: escapeRegex(q), $options: "i" };
  if (category) filter.category = String(category);
  if (location) filter.location = { $regex: escapeRegex(location), $options: "i" };
  const sortBy = sort === "price_asc" ? { price: 1 } : sort === "price_desc" ? { price: -1 } : { createdAt: -1 };
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(48, Math.max(1, parseInt(limit) || 12));
  const col = db.collection("services");
  const [items, total] = await Promise.all([
    col.find(filter).sort(sortBy).skip((p - 1) * l).limit(l).toArray(),
    col.countDocuments(filter),
  ]);
  res.json({ items: await attachVendors(db, items), total, page: p, pages: Math.max(1, Math.ceil(total / l)) });
});

// ---------- Authenticated: single service ----------
export async function serviceDetailHandler(req, res) {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid service ID" });
  const db = await getDb();
  const s = await db.collection("services").findOne({ _id: id });
  const own = s && s.vendorId === req.user.id;
  const visible = s && ((s.status === "approved" && s.isActive !== false) || own || req.user.role === "admin");
  if (!visible) return res.status(404).json({ message: "Service not found or unavailable" });
  const [withVendor] = await attachVendors(db, [s]);
  res.json(withVendor);
}

// ---------- Vendor ----------
vendorRouter.use(verifyJWT, requireRole("vendor"));

function validate(b, partial = false) {
  const out = {};
  const err = (m) => Object.assign(new Error(m), { status: 400 });
  const has = (k) => b[k] !== undefined;
  if (!partial || has("serviceName")) {
    if (typeof b.serviceName !== "string" || b.serviceName.trim().length < 3) throw err("Service name must be at least 3 characters");
    out.serviceName = b.serviceName.trim();
  }
  if (!partial || has("category")) {
    if (!CATEGORIES.includes(b.category)) throw err("Invalid category");
    out.category = b.category;
  }
  if (!partial || has("description")) {
    if (typeof b.description !== "string" || b.description.trim().length < 20) throw err("Description must be at least 20 characters");
    out.description = b.description.trim();
  }
  if (!partial || has("price")) {
    const n = Number(b.price);
    if (!Number.isFinite(n) || n <= 0) throw err("Price must be a positive number");
    out.price = n;
  }
  if (!partial || has("location")) {
    if (typeof b.location !== "string" || !b.location.trim()) throw err("Location is required");
    out.location = b.location.trim();
  }
  if (!partial || has("images")) {
    if (!Array.isArray(b.images) || !b.images.length || b.images.length > 6 || !b.images.every((u) => /^https?:\/\//.test(u)))
      throw err("Provide 1-6 valid image URLs");
    out.images = b.images;
  }
  if (has("isActive")) out.isActive = Boolean(b.isActive);
  return out;
}

async function limitReached(db, user) {
  if (isPremium(user)) return false;
  const count = await db.collection("services").countDocuments({
    vendorId: user.id,
    status: { $in: ["pending", "approved"] },
    isActive: { $ne: false },
  });
  return count >= FREE_LIMIT;
}

vendorRouter.get("/", async (req, res) => {
  const db = await getDb();
  res.json(await db.collection("services").find({ vendorId: req.user.id }).sort({ createdAt: -1 }).toArray());
});

vendorRouter.post("/", async (req, res) => {
  const db = await getDb();
  const data = validate(req.body);
  if (await limitReached(db, req.user))
    return res.status(403).json({ message: "Free plan allows 3 active services. Upgrade to Premium for unlimited services.", code: "LIMIT" });
  const doc = { ...data, vendorId: req.user.id, status: "pending", isActive: true, createdAt: new Date() };
  const r = await db.collection("services").insertOne(doc);
  res.status(201).json({ ...doc, _id: r.insertedId });
});

vendorRouter.put("/:id", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid service ID" });
  const db = await getDb();
  const s = await db.collection("services").findOne({ _id: id });
  if (!s) return res.status(404).json({ message: "Service not found" });
  if (s.vendorId !== req.user.id) return res.status(403).json({ message: "You can only edit your own services" });
  const data = validate(req.body, true);
  if (data.isActive === true && s.isActive === false && (await limitReached(db, req.user)))
    return res.status(403).json({ message: "Free plan allows 3 active services. Upgrade to Premium.", code: "LIMIT" });
  await db.collection("services").updateOne({ _id: id }, { $set: { ...data, updatedAt: new Date() } });
  res.json(await db.collection("services").findOne({ _id: id }));
});

vendorRouter.delete("/:id", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid service ID" });
  const db = await getDb();
  const s = await db.collection("services").findOne({ _id: id });
  if (!s) return res.status(404).json({ message: "Service not found" });
  if (s.vendorId !== req.user.id) return res.status(403).json({ message: "You can only delete your own services" });
  await db.collection("services").deleteOne({ _id: id });
  await db.collection("bookings").updateMany({ serviceId: id.toString(), status: "pending" }, { $set: { status: "cancelled" } });
  res.json({ message: "Service deleted" });
});
