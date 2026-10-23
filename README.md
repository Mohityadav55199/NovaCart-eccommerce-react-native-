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
- **Background jobs** with Inngest (Clerk user sync); users are also created on first request as a fallback
- Optional error monitoring with Sentry

## Roles

| Role | Where | What they can do |
|---|---|---|
| **Customer** | Mobile app | Browse, wishlist, cart, checkout, track orders, cancel an order until it ships (full refund), review delivered orders |
| **Vendor** | Admin site | Manage **their own** products, see only the orders and items they sell, add a carrier and tracking number, mark items shipped or delivered |
| **Admin** | Admin site | Everything: all products, orders and customers; cancel and refund any unshipped order; promote customers to vendors (Customers page) |

Admins are the emails in `ADMIN_EMAIL` (comma-separated), so removing an email there ends that person's access immediately. Everyone else signs up as a customer; an admin makes someone a vendor from the **Customers** page.

## Order lifecycle

1. The customer pays with Stripe. The webhook creates the order (one per payment) and reduces stock.
2. Each order item is fulfilled on its own (a vendor ships their items): `pending`, `shipped`, `delivered`, with a carrier and tracking number. The **order status is derived** from its items and the order keeps a timeline.
3. **Cancelling** is allowed while nothing has shipped: by the customer in the app, or by an admin. It issues a full Stripe refund, puts the stock back, and records who cancelled and why. Cancelling twice (or at the same moment) refunds once.

## Project structure

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend) | REST API | Express, Mongoose, Clerk, Stripe, Cloudinary, Inngest |
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
| `INNGEST_SIGNING_KEY` | Optional |

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

### 1. API on Render

1. Render dashboard, **New, Blueprint**, select this repo. [`render.yaml`](render.yaml) defines the service (root `backend/`, `npm install`, `npm start`, health check `/api/health`).
2. Fill in the environment variables it asks for. Set `CLIENT_URL` to your Vercel admin URL (step 2) and `ADMIN_EMAIL` to your admin email.
3. In MongoDB Atlas, **Network Access**, allow Render's outbound IPs (or `0.0.0.0/0` for a hobby project).
4. In Stripe, **Developers, Webhooks, Add endpoint**: `https://<your-api>.onrender.com/api/payment/webhook`, event `payment_intent.succeeded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

The free Render plan sleeps when idle, so the first request after a pause can take about 30 to 60 seconds.

#### Keeping the free API awake

Render's free tier sleeps after about 15 minutes idle, and the next request waits 30 to 60 seconds for it to boot.

- [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) pings `/api/health` every 10 minutes. Enable it once: GitHub repo, **Settings, Secrets and variables, Actions, Variables**, then add `API_URL` = `https://<your-api>.onrender.com`. You can also run it by hand from the **Actions** tab.
- [`scripts/wake-server.mjs`](scripts/wake-server.mjs) wakes the API and waits until it responds (retrying for up to a few minutes): `API_URL=https://<your-api>.onrender.com npm run wake`. Handy before a demo.

Good to know: GitHub can delay scheduled runs by a few minutes and pauses them after 60 days without repo activity (re-enable in the Actions tab). One always-awake free service uses about 744 of Render's 750 free instance hours per month, so keep it to a single free service.

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
