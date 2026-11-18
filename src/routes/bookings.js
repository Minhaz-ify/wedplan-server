import { Router } from "express";
import { getDb, oid, attachVendors } from "../db.js";
import { verifyJWT, requireRole } from "../middleware.js";

export const customerRouter = Router();
export const vendorBookingsRouter = Router();

const ACTIVE = ["pending", "accepted"];

// ---------- Customer ----------
customerRouter.use(verifyJWT, requireRole("customer"));

customerRouter.post("/", async (req, res) => {
  const { serviceId, eventDate, eventLocation, message = "" } = req.body || {};
  const sid = oid(serviceId);
  if (!sid) return res.status(400).json({ message: "Invalid service ID" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate)) || isNaN(new Date(eventDate)))
    return res.status(400).json({ message: "A valid event date is required" });
  if (new Date(eventDate) < new Date(new Date().toDateString()))
    return res.status(400).json({ message: "Event date cannot be in the past" });
  if (typeof eventLocation !== "string" || !eventLocation.trim())
    return res.status(400).json({ message: "Event location is required" });
  if (String(message).length > 1000) return res.status(400).json({ message: "Message is too long" });

  const db = await getDb();
  const service = await db.collection("services").findOne({ _id: sid });
  if (!service || service.status !== "approved" || service.isActive === false)
    return res.status(404).json({ message: "Service is not available for booking" });
  if (service.vendorId === req.user.id) return res.status(403).json({ message: "You cannot book your own service" });

  const dup = await db.collection("bookings").findOne({
    serviceId: sid.toString(), customerId: req.user.id, eventDate, status: { $in: ACTIVE },
  });
  if (dup) return res.status(409).json({ message: "You already have an active request for this service on that date" });

  const doc = {
    serviceId: sid.toString(), vendorId: service.vendorId, customerId: req.user.id,
    eventDate, eventLocation: eventLocation.trim(), message: String(message).trim(),
    status: "pending", createdAt: new Date(),
  };
  const r = await db.collection("bookings").insertOne(doc);
  res.status(201).json({ ...doc, _id: r.insertedId });
});

customerRouter.get("/mine", async (req, res) => {
  const db = await getDb();
  const bookings = await db.collection("bookings").find({ customerId: req.user.id }).sort({ createdAt: -1 }).toArray();
  const sIds = [...new Set(bookings.map((b) => b.serviceId))].map(oid).filter(Boolean);
  const services = sIds.length ? await db.collection("services").find({ _id: { $in: sIds } }).toArray() : [];
  const sMap = new Map(services.map((s) => [s._id.toString(), s]));
  const withVendor = await attachVendors(db, bookings);
  res.json(
    withVendor.map((b) => {
      const s = sMap.get(b.serviceId);
      return { ...b, service: s ? { id: s._id.toString(), serviceName: s.serviceName, image: s.images?.[0] || null, price: s.price, category: s.category } : null };
    })
  );
});

customerRouter.patch("/:id/cancel", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid booking ID" });
  const db = await getDb();
  const b = await db.collection("bookings").findOne({ _id: id });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.customerId !== req.user.id) return res.status(403).json({ message: "You can only cancel your own bookings" });
  const r = await db.collection("bookings").updateOne({ _id: id, status: "pending" }, { $set: { status: "cancelled" } });
  if (!r.matchedCount) return res.status(409).json({ message: `Only pending requests can be cancelled (this one is ${b.status})` });
  res.json({ message: "Booking cancelled" });
});

// ---------- Vendor ----------
vendorBookingsRouter.use(verifyJWT, requireRole("vendor"));

vendorBookingsRouter.get("/", async (req, res) => {
  const db = await getDb();
  const bookings = await db.collection("bookings").find({ vendorId: req.user.id }).sort({ createdAt: -1 }).toArray();
  const withCustomer = (await attachVendors(db, bookings, "customerId")).map(({ vendor, ...b }) => ({ ...b, customer: vendor }));
  const sIds = [...new Set(bookings.map((b) => b.serviceId))].map(oid).filter(Boolean);
  const services = sIds.length ? await db.collection("services").find({ _id: { $in: sIds } }).toArray() : [];
  const sMap = new Map(services.map((s) => [s._id.toString(), s]));
  res.json(withCustomer.map((b) => ({ ...b, service: sMap.get(b.serviceId) ? { serviceName: sMap.get(b.serviceId).serviceName } : null })));
});

vendorBookingsRouter.patch("/:id", async (req, res) => {
  const id = oid(req.params.id);
  const { status } = req.body || {};
  if (!id) return res.status(400).json({ message: "Invalid booking ID" });
  if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Status must be accepted or rejected" });
  const db = await getDb();
  const b = await db.collection("bookings").findOne({ _id: id });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.vendorId !== req.user.id) return res.status(403).json({ message: "This booking does not belong to you" });
  const r = await db.collection("bookings").updateOne({ _id: id, status: "pending" }, { $set: { status, respondedAt: new Date() } });
  if (!r.matchedCount) return res.status(409).json({ message: `This request was already ${b.status}` });
  res.json({ message: `Booking ${status}` });
});
