import { Router } from "express";
import Stripe from "stripe";
import { getDb, isPremium, findUser } from "../db.js";
import { verifyJWT, requireRole } from "../middleware.js";

export const paymentsRouter = Router();
let stripe;
const getStripe = () => (stripe ||= new Stripe(process.env.STRIPE_SECRET_KEY));
const periodEnd = (sub) => sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
const clientUrl = () => process.env.CLIENT_URL.split(",")[0].trim();

// ---------- Vendor: start checkout ----------
paymentsRouter.post("/checkout", verifyJWT, requireRole("vendor"), async (req, res) => {
  if (isPremium(req.user)) return res.status(409).json({ message: "You are already on the Premium plan" });
  const db = await getDb();
  const price = Number(process.env.PREMIUM_PRICE_USD || 19.99);
  // vendorId always comes from the verified JWT, never from the request body
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: req.user.email,
    client_reference_id: req.user.id,
    metadata: { vendorId: req.user.id },
    subscription_data: { metadata: { vendorId: req.user.id } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          recurring: { interval: "month" },
          product_data: { name: "WedPlan Premium Vendor (monthly)" },
        },
      },
    ],
    success_url: `${clientUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/payment/cancel`,
  });
  await db.collection("transactions").insertOne({
    vendorId: req.user.id, plan: "premium", amount: price, currency: "usd",
    stripeSessionId: session.id, stripeSubscriptionId: null, status: "pending", createdAt: new Date(),
  });
  res.json({ url: session.url });
});

// ---------- Vendor: read status (only written by the webhook) ----------
paymentsRouter.get("/session/:sessionId", verifyJWT, requireRole("vendor"), async (req, res) => {
  const db = await getDb();
  const tx = await db.collection("transactions").findOne({ stripeSessionId: req.params.sessionId, vendorId: req.user.id });
  if (!tx) return res.status(404).json({ message: "Transaction not found" });
  res.json({ status: tx.status, amount: tx.amount, currency: tx.currency });
});

paymentsRouter.post("/cancel", verifyJWT, requireRole("vendor"), async (req, res) => {
  const db = await getDb();
  const tx = await db.collection("transactions").findOne({ vendorId: req.user.id, status: "paid", stripeSubscriptionId: { $ne: null } }, { sort: { createdAt: -1 } });
  if (!tx) return res.status(404).json({ message: "No active subscription found" });
  await getStripe().subscriptions.update(tx.stripeSubscriptionId, { cancel_at_period_end: true });
  res.json({ message: "Subscription will end at the close of the current billing period" });
});

// ---------- Stripe webhook: the ONLY place Premium gets activated ----------
async function activate(db, session) {
  const vendorId = session.metadata?.vendorId;
  if (!vendorId || session.payment_status !== "paid") return;
  const sub = await getStripe().subscriptions.retrieve(session.subscription);
  const user = await findUser(db, vendorId);
  if (!user) return;
  await db.collection("user").updateOne(
    { _id: user._id },
    { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: new Date(periodEnd(sub) * 1000) } }
  );
  await db.collection("transactions").updateOne(
    { stripeSessionId: session.id },
    {
      $set: { status: "paid", stripeSubscriptionId: session.subscription, amount: (session.amount_total ?? 0) / 100, currency: session.currency },
      $setOnInsert: { vendorId, plan: "premium", createdAt: new Date() },
    },
    { upsert: true }
  );
}

export async function stripeWebhook(req, res) {
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook signature verification failed`);
  }
  try {
    const db = await getDb();
    const obj = event.data.object;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await activate(db, obj);
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      await db.collection("transactions").updateOne({ stripeSessionId: obj.id, status: "pending" }, { $set: { status: "failed" } });
    } else if (event.type === "invoice.paid" && obj.subscription) {
      // renewals: extend the expiry
      const tx = await db.collection("transactions").findOne({ stripeSubscriptionId: obj.subscription, status: "paid" });
      if (tx) {
        const sub = await getStripe().subscriptions.retrieve(obj.subscription);
        const user = await findUser(db, tx.vendorId);
        if (user) await db.collection("user").updateOne({ _id: user._id }, { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: new Date(periodEnd(sub) * 1000) } });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const vendorId = obj.metadata?.vendorId;
      const user = vendorId && (await findUser(db, vendorId));
      if (user) await db.collection("user").updateOne({ _id: user._id }, { $set: { subscriptionPlan: "free", subscriptionExpiresAt: null } });
    }
    res.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error", e);
    res.status(500).json({ message: "Webhook handler failed" });
  }
}
