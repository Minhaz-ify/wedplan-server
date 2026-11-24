
# WedPlan Server

**WedPlan** is a wedding planning platform that connects customers with wedding service providers. This repository contains the backend REST API built with Express.js, providing service management, bookings, user management, authentication, and subscription payment functionality.

## Live Links

| Resource            | Link                                         |
| ------------------- | -------------------------------------------- |
| Live Website        | https://wedplan-client-delta.vercel.app      |
| Live Backend API    | https://wedplan-server-three.vercel.app      |
| Frontend Repository | https://github.com/Minhaz-ify/wedplan-client |
| Backend Repository  | https://github.com/Minhaz-ify/wedplan-server |

## Technology Stack

| Technology            | Purpose                              |
| --------------------- | ------------------------------------ |
| Node.js               | JavaScript Runtime                   |
| Express 5             | REST API Framework                   |
| MongoDB               | Database                             |
| MongoDB Native Driver | Database Operations                  |
| Better Auth           | Authentication on the Next.js client |
| jose                  | JWT Verification                     |
| JWKS                  | Public Key Verification              |
| Stripe                | Subscription Payments                |
| Stripe Webhooks       | Payment Event Verification           |
| Vercel                | Backend Deployment                   |

## Project Features

### Authentication & Authorization

- JWT verification using `jose` and Better Auth JWKS.
- Role-based access control for customers, vendors, and admins.
- User roles and account blocking status are verified directly from MongoDB.
- Protected routes with authentication middleware.
- Ownership verification for vendor resources.

### Service Management

- Public service listing with search and filtering.
- Search services by keyword, category, and location.
- Service sorting and pagination.
- Only approved and active services are publicly available.
- Vendors can create, update, and delete their own services.
- Free-plan vendors can have a maximum of 3 active services.

### Booking Management

- Customers can book wedding services.
- Customers cannot book their own services.
- Duplicate active bookings for the same date are prevented.
- Customers can view and cancel pending bookings.
- Vendors can view, accept, and reject booking requests.

### Admin Management

- View and manage registered users.
- Block users.
- Approve, reject, and delete services.
- View transaction records.

### Stripe Subscription & Payments

- Stripe Checkout integration.
- Vendor subscription management.
- Subscription cancellation.
- Verified Stripe webhook events.
- Premium activation only through verified Stripe webhooks.
- Webhook signature verification for secure payment processing.

## Installation and Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Minhaz-ify/wedplan-server.git
cd wedplan-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create your environment file.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Configure the required environment variables in `.env`.

### 4. Run the Development Server

```bash
npm run dev
```

## Authentication Architecture

Better Auth is implemented in the Next.js frontend application. The Express backend independently verifies the JWT received from the client.

Authentication flow:

1. The user signs in through the Next.js application using Better Auth.
2. The client requests a short-lived JWT.
3. The client sends the JWT to the Express API.
4. The backend verifies the JWT signature using the Better Auth JWKS endpoint:

   `BETTER_AUTH_URL/api/auth/jwks`
5. After successful verification, the backend loads the user from MongoDB.
6. The backend reads the user's `role` and `isBlocked` status directly from the database.
7. Role-based middleware checks whether the user is authorized to access the requested endpoint.

**Security:** The backend never trusts the user's role or blocked status from the JWT payload or request body. Authorization decisions are based on the database.

## API Documentation

### Public Services

| Method | Endpoint              | Description                      | Access        |
| ------ | --------------------- | -------------------------------- | ------------- |
| GET    | `/api/services`     | Get approved and active services | Public        |
| GET    | `/api/services/:id` | Get service details              | Authenticated |

Supported query parameters for service listing:

- `q` — Search by keyword.
- `category` — Filter by service category.
- `location` — Filter by location.
- `sort` — Sort services.
- `page` — Pagination.

### Vendor Services

| Method | Endpoint                 | Description           | Access |
| ------ | ------------------------ | --------------------- | ------ |
| GET    | `/api/vendor/services` | Get vendor's services | Vendor |
| POST   | `/api/vendor/services` | Create a service      | Vendor |
| PUT    | `/api/vendor/services` | Update a service      | Vendor |
| DELETE | `/api/vendor/services` | Delete a service      | Vendor |

Vendor restrictions:

- Vendors can only manage their own services.
- Free-plan vendors can have a maximum of 3 active services.

### Customer Bookings

| Method | Endpoint                     | Description              | Access   |
| ------ | ---------------------------- | ------------------------ | -------- |
| POST   | `/api/bookings`            | Create a booking         | Customer |
| GET    | `/api/bookings/mine`       | Get customer's bookings  | Customer |
| PATCH  | `/api/bookings/:id/cancel` | Cancel a pending booking | Customer |

Booking restrictions:

- Customers cannot book their own services.
- Duplicate active bookings for the same date are prevented.
- Only pending bookings can be cancelled by customers.

### Vendor Bookings

| Method | Endpoint                     | Description                | Access |
| ------ | ---------------------------- | -------------------------- | ------ |
| GET    | `/api/vendor/bookings`     | View booking requests      | Vendor |
| PATCH  | `/api/vendor/bookings/:id` | Accept or reject a booking | Vendor |

### Admin Management

| Method | Endpoint                       | Description                 | Access |
| ------ | ------------------------------ | --------------------------- | ------ |
| GET    | `/api/admin/users`           | Get registered users        | Admin  |
| PATCH  | `/api/admin/users/:id/block` | Block a user                | Admin  |
| GET    | `/api/admin/services`        | Get services for moderation | Admin  |
| PATCH  | `/api/admin/services`        | Approve or reject services  | Admin  |
| DELETE | `/api/admin/services`        | Delete a service            | Admin  |
| GET    | `/api/admin/transactions`    | View transactions           | Admin  |

### Payments & Subscriptions

| Method | Endpoint                   | Description                           | Access      |
| ------ | -------------------------- | ------------------------------------- | ----------- |
| POST   | `/api/payments/checkout` | Create Stripe Checkout session        | Vendor      |
| POST   | `/api/payments/cancel`   | Cancel subscription                   | Vendor      |
| POST   | `/api/webhooks/stripe`   | Handle verified Stripe webhook events | Stripe only |

**Important:** The Stripe webhook is the only place where Premium status is activated. A successful checkout request alone does not activate Premium.

### User & Statistics

| Method | Endpoint       | Description                     | Access        |
| ------ | -------------- | ------------------------------- | ------------- |
| GET    | `/api/me`    | Get current user information    | Authenticated |
| PATCH  | `/api/me`    | Update current user information | Authenticated |
| GET    | `/api/stats` | Get dashboard statistics        | Authenticated |

## Admin Account Setup

To create an admin account:

1. Register normally on the WedPlan website using the email address that should become the admin account.
2. Open the server project directory.
3. Run:

```bash
node scripts/make-admin.js
```

The script accepts the admin email as an argument:

```bash
node scripts/make-admin.js admin@example.com
```

## Optional Demo Data

The project includes a seed script to add 8 approved services to an existing vendor account.

Run:

```bash
node scripts/seed.js vendor@example.com
```

Replace the email with an existing registered vendor's email address.

## Stripe Webhook Configuration

### Local Development

Install and configure the Stripe CLI, then run:

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

The Stripe CLI will generate a webhook signing secret beginning with `whsec_`.

Add that secret to your `.env` file:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

### Stripe Test Card

| Field       | Test Value              |
| ----------- | ----------------------- |
| Card Number | `4242 4242 4242 4242` |
| Expiry Date | Any future date         |
| CVC         | Any valid 3-digit CVC   |
| ZIP Code    | Any valid ZIP code      |

### Production Webhook

Add the following webhook URL in your Stripe Dashboard:

```text
https://wedplan-server-three.vercel.app/api/webhooks/stripe
```

Subscribe to these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `invoice.paid`
- `customer.subscription.deleted`

Make sure the production webhook signing secret is configured in the Vercel environment variables.

## Deployment on Vercel

The backend is configured for Vercel deployment.

The repository includes:

- `vercel.json`
- `api/index.js`

Deployment steps:

1. Import the `wedplan-server` repository into Vercel.
2. Configure the required environment variables.
3. Set the frontend and authentication URLs correctly.
4. Configure the Stripe production webhook.
5. Deploy the project.

Important URL configurations:

| Variable            | Value                                       |
| ------------------- | ------------------------------------------- |
| `CLIENT_URL`      | `https://wedplan-client-delta.vercel.app` |
| `BETTER_AUTH_URL` | `https://wedplan-client-delta.vercel.app` |

Configure all other required environment variables using the project's `.env.example` file.

## Project Structure

```text
wedplan-server/
│
├── api/
│   └── index.js
│
├── scripts/
│   ├── make-admin.js
│   └── seed.js
│
├── src/
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── vercel.json
└── README.md
```

## Security Notes

- Never commit `.env` files or expose database credentials.
- Keep Stripe secret keys and webhook signing secrets private.
- Verify JWT signatures using the configured JWKS endpoint.
- Always check user roles and account status against MongoDB.
- Verify Stripe webhook signatures before processing payment events.
- Keep authorization and ownership checks on the backend.

---

**WedPlan Server**
Backend REST API for the WedPlan wedding planning platform.

Built with Express 5, MongoDB, Better Auth JWT verification, and Stripe.
