// Dummy configuration so modules that read the environment can be imported in tests.
// Nothing here talks to a real service: no test opens a database or calls Stripe/Clerk.
process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dummy";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA";
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";
process.env.ADMIN_EMAIL = "boss@example.com, Second@Example.com";
