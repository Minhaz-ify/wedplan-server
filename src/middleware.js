import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb, findUser } from "./db.js";

let jwks;

// Verifies the Better Auth JWT (signature via the client app's JWKS), then
// loads the user from MongoDB so role / blocked status are never trusted from the client.
export async function verifyJWT(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    jwks ||= createRemoteJWKSet(new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`));
    const { payload } = await jwtVerify(token, jwks);
    const db = await getDb();
    const user = await findUser(db, payload.id || payload.sub);
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been blocked" });
    req.user = { ...user, id: user._id.toString() };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    next();
  };
