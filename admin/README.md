# NovaCart Admin

Admin dashboard for NovaCart: products, orders, customers and sales stats.
React 19 + Vite, TanStack Query, Tailwind CSS with daisyUI, Clerk for sign-in.

Only emails listed in the backend's `ADMIN_EMAIL` can use the dashboard.

```bash
npm install
cp .env.example .env     # set VITE_CLERK_PUBLISHABLE_KEY and VITE_API_URL
npm run dev              # http://localhost:5173
npm run build            # production build in dist/
```

Deploys to Vercel with the root directory set to `admin` (see the [root README](../README.md#deployment)).

By Mohit Yadav ([@mohityadav55199](https://github.com/mohityadav55199)).
