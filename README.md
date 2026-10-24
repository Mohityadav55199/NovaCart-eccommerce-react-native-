<h1 align="center">NovaCart</h1>

<p align="center">
  A full-stack e-commerce platform: a React Native mobile app, an admin dashboard and a REST API.<br/>
  Built by <a href="https://github.com/mohityadav55199">Mohit Yadav</a> (<code>mohityadav55199</code>).
</p>

## Features

- **Mobile app** (React Native + Expo): browse products, favourites, cart, addresses, Stripe checkout and order history
- **Authentication** with Clerk (email and social sign-in)
- **Admin dashboard** (React + Vite): products (CRUD with image upload), orders, customers and live stats
- **REST API** (Node.js + Express + MongoDB) with role-based, admin-only routes
- **Payments** with Stripe (payment sheet, free shipping over $100, 8% tax), including webhook-based order creation
- **Image storage** on Cloudinary
- **User sync** from Clerk through a signed webhook (new users, email changes, deletions); users are also created on first request as a fallback
- **Vendors get paid** through Stripe Connect: each delivered item pays the vendor their share (platform fee configurable)
- **Controls**: permission-based roles, an audit log, refund limits with second-admin approval, review of new vendors' products, and a pause switch per vendor
- Optional error monitoring with Sentry

## Roles and permissions

Every route asks for a named **permission**, never for a role name. Roles are sets of permissions, and one person can hold several (a vendor who is also a customer, for example). `x:own` means "only their own data".

| Role | Where | Can do |
|---|---|---|
| **Customer** | Mobile app | Browse, wishlist, cart, checkout, track orders, cancel an order until it ships (full refund), review delivered orders |
| **Vendor** | Admin site | Their **own** products and orders only (`products:write:own`, `orders:fulfil:own`): add carrier and tracking, ship, deliver. Sees their payouts. First products need approval |
| **Support** | Admin site | See all orders and customers (`orders:view`, `customers:view`) and refund up to the support limit. Cannot edit products or change roles |
| **Admin** | Admin site | Everything, including approving products and large refunds, managing roles, pausing vendors and reading the audit log |

- **Admin** is not stored: it is the verified email(s) in `ADMIN_EMAIL`. Remove an email and that access ends at once. Everyone else signs up as a customer, and anyone can become a vendor from the admin site.
- **Sign-in** offers *Customer* or *Vendor* (admins sign in through Vendor); this only picks the workspace. What a person may do is decided by the server from their account.
- **Customer view**: the same account can open the customer home page, which offers "Become a vendor". The server also refuses staff powers to requests that come from the customer view.

## Safety rules

- **Refunds**: only unshipped orders can be cancelled, and the customer is refunded in full. Support can refund up to `SUPPORT_REFUND_LIMIT`; anything above waits for an admin. A refund above `REFUND_APPROVAL_OVER` needs a second admin (the only admin may approve their own).
- **Audit log**: every refund, refund approval, role change, product review and vendor pause is recorded with who did it. Admins read it under *Audit log*.
- **Vendor trust**: a vendor's first `TRUSTED_AFTER_APPROVED` products are hidden until an admin approves them. Admins can reject with a note, or pause a vendor (products come off sale; open orders can still be shipped). Removing the vendor role also stops them from re-adding it themselves.
- **Payouts**: when an item is delivered, the vendor's share (price minus `PLATFORM_FEE_PERCENT`) is paid through Stripe Connect after `PAYOUT_HOLD_HOURS`. A vendor must ship before delivering, and a paid item can no longer be changed.
- **Abuse protection**: rate limits per IP, security headers, and a size limit on request bodies.

## Order lifecycle

1. The customer pays with Stripe. The webhook creates the order (one per payment) and reduces stock.
2. Each order item is fulfilled on its own (a vendor ships their items): `pending`, `shipped`, `delivered`, with a carrier and tracking number. The **order status is derived** from its items and the order keeps a timeline.
3. **Cancelling** is allowed while nothing has shipped: by the customer in the app, or by an admin. It issues a full Stripe refund, puts the stock back, and records who cancelled and why. Cancelling twice (or at the same moment) refunds once.

## Project structure

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend) | REST API | Express, Mongoose, Clerk, Stripe (+ Connect), Cloudinary |
| [`admin/`](admin) | Admin dashboard | React 19, Vite, TanStack Query, Tailwind + daisyUI |
| [`mobile/`](mobile) | Customer app | Expo (SDK 54), Expo Router, NativeWind, Stripe React Native |

## Getting started

Requires Node.js 20+.

```bash
git clone https://github.com/mohityadav55199/NovaCart-eccommerce-react-native-.git
cd NovaCart-eccommerce-react-native-
npm run install:all      # installs root, backend, admin and mobile
```

Copy each `.env.example` to `.env` and fill it in (see below), then start everything with one command:

```bash
npm run dev              # backend :3000, admin :5173, mobile (Expo)
```

Or run them individually: `npm run dev:backend`, `npm run dev:admin`, `npm run dev:mobile`.

Optional sample data (10 products; **this clears existing products first**):

```bash
npm run seed:products --prefix backend
```

More demo products (22 across Electronics, Fashion, Accessories, Sports and Books). Additive and safe to re-run: it never deletes or overwrites anything:

```bash
npm run seed:more --prefix backend
```

## Environment variables

### `backend/.env`

| Variable | Notes |
|---|---|
| `NODE_ENV`, `PORT` | `development` and `3000` locally |
| `DB_URL` | MongoDB Atlas connection string. If your network blocks DNS SRV lookups, use the non-SRV `mongodb://` string (Atlas: Connect, Drivers, toggle "Legacy URI String") |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard, API Keys |
| `ADMIN_EMAIL` | Email(s) allowed into the admin panel. Comma-separated, case-insensitive |
| `CLIENT_URL` | Admin URL allowed by CORS (`http://localhost:5173` locally) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary, API Keys (use a key with the Master Admin role) |
| `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` | Stripe test-mode keys |
| `STRIPE_WEBHOOK_SECRET` | Local: `stripe listen --forward-to localhost:3000/api/payment/webhook`. Production: Stripe, Developers, Webhooks |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Signing secret of the Clerk webhook endpoint (see Deployment) |
| `SUPPORT_REFUND_LIMIT` | Support can refund up to this much on their own (default `100`) |
| `REFUND_APPROVAL_OVER` | Refunds above this need a second admin (default `500`) |
| `TRUSTED_AFTER_APPROVED` | A vendor's first N products need approval (default `3`) |
| `PLATFORM_FEE_PERCENT` | Share the store keeps of each delivered item (default `10`) |
| `PAYOUT_HOLD_HOURS` | Wait this long after delivery before paying the vendor (default `72`) |
| `REQUIRE_REVERIFICATION` | `true` asks Clerk to re-confirm identity before refunds and role changes (default `false`) |

### `admin/.env`

```bash
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_URL=http://localhost:3000/api
VITE_SENTRY_DSN=            # optional
```

### `mobile/.env`

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_URL=http://localhost:3000/api   # use your PC's LAN IP on a physical device
EXPO_PUBLIC_SENTRY_DSN=                         # optional
```

The same Clerk publishable key is used in all three apps; the Clerk secret key belongs only in the backend. `.env` files are git-ignored.

## Deployment

The API runs on **Render** and the admin dashboard on **Vercel**.

### 0. One-time setup in Clerk and Stripe

1. **Clerk webhook** (keeps users in sync): Clerk dashboard, **Configure, Webhooks, Add endpoint**. URL `https://<your-api>.onrender.com/api/webhooks/clerk`, events `user.created`, `user.updated`, `user.deleted`. Copy the **Signing secret** into `CLERK_WEBHOOK_SIGNING_SECRET` on Render.
2. **Stripe Connect** (vendor payouts): Stripe dashboard, **Connect, Get started** (test mode is fine). Until it is on, vendors see "payouts are not switched on yet" and their earnings wait; nothing else is affected.
3. **Two-factor sign-in** for admins and vendors: Clerk dashboard, **User & authentication, Multi-factor**.
4. **Re-verification** (optional): after trying a refund with `REQUIRE_REVERIFICATION=true` on a test account, leave it on if Clerk shows its confirm dialog.

### 1. API on Render

1. Render dashboard, **New, Blueprint**, select this repo. [`render.yaml`](render.yaml) defines the service (root `backend/`, `npm install`, `npm start`, health check `/api/health`).
2. Fill in the environment variables it asks for. Set `CLIENT_URL` to your Vercel admin URL (step 2) and `ADMIN_EMAIL` to your admin email.
3. In MongoDB Atlas, **Network Access**, allow Render's outbound IPs (or `0.0.0.0/0` for a hobby project).
4. In Stripe, **Developers, Webhooks, Add endpoint**: `https://<your-api>.onrender.com/api/payment/webhook`, event `payment_intent.succeeded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

The free Render plan sleeps when idle, so the first request after a pause can take about 30 to 60 seconds.

#### Keeping the free API awake

Render's free tier sleeps after about 15 minutes without traffic, and the next request waits 30 to 60 seconds for it to boot. Three layers keep it awake, from most to least reliable:

1. **The server pings itself** every 9 minutes ([`server.js`](backend/src/server.js)). Render sets `RENDER_EXTERNAL_URL` automatically, and a request to a service's own public address counts as traffic. Nothing to set up.
2. **An external timer (recommended as a second layer)**, for example [cron-job.org](https://cron-job.org) (free): create a job with the URL `https://<your-api>.onrender.com/api/health`, method **GET**, every **5 minutes**, timeout **60 s**. It also wakes the service if it ever restarts.
3. **GitHub Actions**, [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml): pings `/api/health` on a schedule. Enable it with the repo variable `API_URL` (Settings, Secrets and variables, Actions, Variables). Note that GitHub runs scheduled jobs far less often than asked (in practice a few times a day), so treat it as a backup only.

[`scripts/wake-server.mjs`](scripts/wake-server.mjs) wakes the API and waits until it answers (`API_URL=https://<your-api>.onrender.com npm run wake`). Handy before a demo.

One always-awake free service uses about 744 of Render's 750 free instance hours per month, so keep it to a single free service.

### 2. Admin on Vercel

1. Vercel, **Add New, Project**, import this repo and set **Root Directory** to `admin` (Vite is detected automatically; [`admin/vercel.json`](admin/vercel.json) handles SPA routing).
2. Environment variables: `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL=https://<your-api>.onrender.com/api`.
3. Deploy, then put the resulting URL into `CLIENT_URL` on Render and redeploy the API.

### 3. Android APK (EAS Build)

[`mobile/eas.json`](mobile/eas.json) has a `preview` profile that produces an installable `.apk`.

```bash
cd mobile
npm install -g eas-cli
eas login

# build-time env vars (.env is not uploaded to EAS); use your deployed API
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<your-api>.onrender.com/api --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_test_... --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value pk_test_... --visibility plaintext

eas build --platform android --profile preview
```

When the build finishes, EAS prints a download link (and QR code) for the APK. Use `--local` to build on your own machine instead (needs the Android SDK).

Before a build, check that the app bundles the way the build server does: `cd mobile && npx expo export --platform android`. If EAS fails with *Cannot find module `babel-preset-expo`*, make sure it is a direct dependency (`npx expo install babel-preset-expo -- --save-dev`).

## Scripts (repo root)

| Command | Does |
|---|---|
| `npm run dev` | Backend, admin and mobile together |
| `npm run install:all` | Install every package |
| `npm run build` | Install and build the admin |
| `npm start` | Start the API in production mode |

## Author

**Mohit Yadav** ([@mohityadav55199](https://github.com/mohityadav55199))

## License

ISC
