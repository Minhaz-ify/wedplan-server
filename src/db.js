import { MongoClient, ObjectId } from "mongodb";

let cached;
export function getDb() {
  if (!cached) {
    const client = new MongoClient(process.env.MONGODB_URI);
    cached = client.connect().then((c) => c.db(process.env.MONGODB_DB || "wedplan"));
    cached.catch(() => (cached = undefined));
  }
  return cached;
}

export const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);

// Better Auth stores its users in the "user" collection
export async function findUser(db, id) {
  const o = oid(id);
  return db.collection("user").findOne({ $or: [...(o ? [{ _id: o }] : []), { id: String(id) }] });
}

export const isPremium = (u) =>
  u?.subscriptionPlan === "premium" && u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt) > new Date();

export const CATEGORIES = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
];

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function attachVendors(db, items, key = "vendorId") {
  const ids = [...new Set(items.map((i) => i[key]))].map(oid).filter(Boolean);
  const users = ids.length ? await db.collection("user").find({ _id: { $in: ids } }).toArray() : [];
  const map = new Map(
    users.map((u) => [
      u._id.toString(),
      { id: u._id.toString(), name: u.name, email: u.email, image: u.image || null, businessName: u.businessName || null, premium: isPremium(u) },
    ])
  );
  return items.map((i) => ({ ...i, vendor: map.get(i[key]) || null }));
}
