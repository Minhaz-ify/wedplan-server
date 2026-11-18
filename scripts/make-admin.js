// Usage: node scripts/make-admin.js admin@example.com
// 1) Sign up normally with that email on the website  2) run this script to promote it.
import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/make-admin.js <email>"); process.exit(1); }
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const r = await client.db(process.env.MONGODB_DB || "wedplan").collection("user").updateOne({ email }, { $set: { role: "admin", isBlocked: false } });
console.log(r.matchedCount ? `${email} is now an admin` : "No user with that email. Sign up first.");
await client.close();
