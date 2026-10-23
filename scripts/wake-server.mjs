// Wakes a sleeping Render free-tier service and waits until it answers.
// Usage: API_URL=https://novacart-api.onrender.com node scripts/wake-server.mjs
//        node scripts/wake-server.mjs https://novacart-api.onrender.com
//
// A free Render service sleeps after ~15 min idle; the first request then takes 30-60 s while it
// boots. This script retries until /api/health responds, so it works both as a keep-alive ping
// and as a "wait until the API is ready" step before demos or tests.

const base = (process.argv[2] || process.env.API_URL || "").replace(/\/+$/, "").replace(/\/api$/, "");

const ATTEMPTS = Number(process.env.WAKE_ATTEMPTS || 8);
const ATTEMPT_TIMEOUT_MS = Number(process.env.WAKE_TIMEOUT_MS || 70_000); // one cold start fits in one attempt
const RETRY_DELAY_MS = Number(process.env.WAKE_DELAY_MS || 10_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const url = `${base}/api/health`;
const startedAt = Date.now();
let isUp = false;

// exitCode (instead of process.exit) lets Node close fetch's sockets cleanly; exiting early
// can crash with a libuv assertion on Windows
if (!base) {
  console.log("API_URL is not set, nothing to wake. Set it to your Render URL (e.g. https://novacart-api.onrender.com).");
  isUp = true;
}

for (let attempt = 1; !isUp && attempt <= ATTEMPTS; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
    if (response.ok) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`API is up (HTTP ${response.status}) after ${seconds}s, attempt ${attempt}/${ATTEMPTS}`);
      isUp = true;
      break;
    }
    console.log(`Attempt ${attempt}/${ATTEMPTS}: HTTP ${response.status}`);
  } catch (error) {
    console.log(`Attempt ${attempt}/${ATTEMPTS}: ${error.name === "TimeoutError" ? "timed out" : error.message}`);
  }

  if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
}

if (!isUp) {
  console.error(`API did not respond at ${url} after ${ATTEMPTS} attempts`);
  process.exitCode = 1;
}
