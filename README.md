# WedPlan — Server (Express + MongoDB)

REST API for the WedPlan wedding planning platform.

## Stack
Express 5, MongoDB (native driver), `jose` (verifies Better Auth JWTs via JWKS), Stripe (subscriptions + webhook).

## Setup
```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

## Auth model
Better Auth runs in the **client** (Next.js). The client requests a short-lived JWT; this server verifies its
signature against `BETTER_AUTH_URL/api/auth/jwks`, then loads the user from MongoDB so `role` and `isBlocked`
are always read from the database (never trusted from the token or request body).

## Main endpoints
| Method | Route | Access |
|---|---|---|
| GET | /api/services (q, category, location, sort, page) | public (approved + active only) |
| GET | /api/services/:id | any logged-in user |
| GET/POST/PUT/DELETE | /api/vendor/services | vendor (owner only, free plan max 3 active) |
| POST | /api/bookings | customer (not own service, no duplicate active date) |
| GET | /api/bookings/mine, PATCH /api/bookings/:id/cancel | customer (pending only) |
| GET, PATCH | /api/vendor/bookings(/:id) | vendor (accept/reject) |
| GET | /api/admin/users, PATCH /api/admin/users/:id/block | admin |
| GET, PATCH, DELETE | /api/admin/services | admin (approve / reject / delete) |
| GET | /api/admin/transactions | admin (read-only) |
| POST | /api/payments/checkout, POST /api/payments/cancel | vendor |
| POST | /api/webhooks/stripe | Stripe only (signature verified) — the ONLY place Premium is activated |
| GET/PATCH | /api/me, GET /api/stats | any logged-in user |

## Admin account
1. Sign up normally on the website with the admin email.
2. `node scripts/make-admin.js admin@example.com`

Optional demo data: `node scripts/seed.js vendor@example.com` (adds 8 approved services to an existing vendor).

## Stripe webhook (local)
```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```
Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`.
For production, add `https://<server-domain>/api/webhooks/stripe` in the Stripe dashboard with events:
`checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`.

## Deploy (Vercel)
`vercel.json` + `api/index.js` are included. Set all env vars; set `CLIENT_URL` and `BETTER_AUTH_URL` to the live client URL.
