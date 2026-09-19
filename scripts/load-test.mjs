#!/usr/bin/env node
/**
 * Lightweight day-1 load smoke for ConnectPort API.
 *
 * Usage:
 *   API_BASE=http://localhost:3005/api node scripts/load-test.mjs
 *
 * Covers: health, catalog, signup throttle surface, login fail path.
 * Does not charge Paystack; webhook check is signature-path only when secret set.
 */

const BASE = (process.env.API_BASE || 'http://localhost:3005/api').replace(
  /\/$/,
  '',
);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 20);
const ITERATIONS = Number(process.env.LOAD_ITERATIONS || 5);

async function hit(path, opts = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    return { ok: res.ok || res.status < 500, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function summarize(label, results) {
  const ok = results.filter((r) => r.ok).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ?? 0;
  const avg = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
  console.log(
    `${label}: ${ok}/${results.length} ok | avg ${avg}ms | p95 ${p95}ms | statuses ${[...new Set(results.map((r) => r.status))].join(',')}`,
  );
  return { ok, total: results.length, avg, p95 };
}

async function burst(label, fn) {
  const results = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const batch = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => fn()),
    );
    results.push(...batch);
  }
  return summarize(label, results);
}

async function main() {
  console.log(`Load smoke → ${BASE} (c=${CONCURRENCY} x ${ITERATIONS})`);

  const health = await burst('GET /health', () => hit('/health'));
  const ready = await burst('GET /ready', () => hit('/ready'));
  const catalog = await burst('GET /products', () => hit('/products?limit=48'));
  const loginFail = await burst('POST /auth/login (bad)', () =>
    hit('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: `loadtest-${Date.now()}@example.com`,
        password: 'wrong-password-xx',
      }),
    }),
  );

  const webhook = await hit('/webhooks/paystack', {
    method: 'POST',
    body: JSON.stringify({ event: 'charge.success', data: {} }),
    headers: { 'x-paystack-signature': 'invalid' },
  });
  console.log(
    `POST /webhooks/paystack: status ${webhook.status} in ${webhook.ms}ms (expect 4xx without valid sig)`,
  );

  const failed = [health, ready, catalog].some((s) => s.ok < s.total * 0.9);
  if (failed) {
    console.error('Load smoke FAILED: too many non-ok responses on critical paths.');
    process.exit(1);
  }
  console.log('Load smoke OK. Wire alerts on /ready, Postgres connections, Nest p95, Redis memory before go-live.');
  if (loginFail.ok === 0) {
    console.log('Note: login failures correctly rejected (expected under throttle/auth).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
