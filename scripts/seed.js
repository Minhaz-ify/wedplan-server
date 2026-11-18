// Usage: node scripts/seed.js vendor@example.com
// Inserts 8 approved demo services owned by an existing vendor account (so the home page has data).
import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/seed.js <vendor-email>"); process.exit(1); }
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB || "wedplan");
const vendor = await db.collection("user").findOne({ email });
if (!vendor) { console.error("Vendor not found. Sign up first as a Vendor."); process.exit(1); }
const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;
const base = [
  ["Golden Hour Wedding Photography", "Photography & Videography", 1200, "Dhaka", "photo-1519741497674-611481863552"],
  ["Cinematic Wedding Films", "Photography & Videography", 1800, "Chattogram", "photo-1511285560929-80b456fea0bc"],
  ["Riverside Garden Venue", "Wedding Venues", 3500, "Sylhet", "photo-1464366400600-7168b8af9bc3"],
  ["Grand Ballroom Hall", "Wedding Venues", 5200, "Dhaka", "photo-1519167758481-83f550bb49b3"],
  ["Blooming Petal Florals & Decor", "Decoration & Florist", 900, "Chattogram", "photo-1478146896981-b80fe463b330"],
  ["Royal Feast Catering", "Catering Services", 2500, "Dhaka", "photo-1555244162-803834f70033"],
  ["Bridal Glow Makeup Studio", "Makeup & Styling", 450, "Chattogram", "photo-1487412947147-5cebf100ffc2"],
  ["Heritage Bridal Couture", "Wedding Fashion", 1500, "Dhaka", "photo-1594552072238-b8a33785b261"],
];
const docs = base.map(([serviceName, category, price, location, p]) => ({
  serviceName, category, price, location, images: [img(p)],
  description: `${serviceName}: a professional, fully-managed ${category.toLowerCase()} service tailored to your wedding day.`,
  vendorId: vendor._id.toString(), status: "approved", isActive: true, createdAt: new Date(),
}));
await db.collection("services").insertMany(docs);
console.log(`Inserted ${docs.length} services for ${email}`);
await client.close();
