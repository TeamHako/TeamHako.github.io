// End-to-end test: runs the Worker under `wrangler dev` against a fake Stripe.
//   npm test
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const STRIPE_PORT = 8971, WORKER_PORT = 8972, WHSEC = "whsec_test";
const W = `http://127.0.0.1:${WORKER_PORT}`;

// --- fake Stripe -----------------------------------------------------------
const sessions = {};
const calls = [];
let n = 0;
const stripe = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const params = Object.fromEntries(new URLSearchParams(body));
    calls.push({ method: req.method, url: req.url, params, auth: req.headers.authorization });
    const send = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      const id = `cs_test_${++n}`;
      sessions[id] = { id, url: `https://checkout.stripe.test/${id}`, payment_status: "unpaid",
                       metadata: { edition: params["metadata[edition]"] }, payment_intent: `pi_${n}` };
      return send(sessions[id]);
    }
    const m = req.url.match(/^\/v1\/checkout\/sessions\/(cs_\w+)$/);
    if (m) return sessions[m[1]] ? send(sessions[m[1]]) : send({ error: { message: "nope" } }, 404);
    if (req.url.startsWith("/v1/payment_intents/")) return send({ ok: true });
    send({ error: { message: "unexpected" } }, 400);
  });
});
await new Promise((r) => stripe.listen(STRIPE_PORT, "127.0.0.1", r));

// --- Worker under wrangler dev ----------------------------------------------
const vars = { STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, PREORDERS_OPEN: "true",
               FOUNDER_TOTAL: "2", STRIPE_PRICE_ID: "price_test", STRIPE_SECRET_KEY: "sk_test_x",
               STRIPE_WEBHOOK_SECRET: WHSEC, SIGNUPS_TOKEN: "tok_test_123" };
const args = ["wrangler", "dev", "--port", String(WORKER_PORT), "--ip", "127.0.0.1",
              "--persist-to", `/tmp/hako-shop-test-${process.pid}`];
for (const [k, v] of Object.entries(vars)) args.push("--var", `${k}:${v}`);
const env = { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
const dev = spawn("npx", args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));

async function up() {
  for (let i = 0; i < 120; i++) {
    try { await fetch(`${W}/status`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("wrangler dev didn't start:\n" + log);
}

const get = (p, h = {}) => fetch(W + p, { headers: h });
const post = (p, body, h = {}) => fetch(W + p, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
                                                  headers: { "Content-Type": "application/json", ...h } });
function signed(event) {
  const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", WHSEC).update(`${t}.${body}`).digest("hex");
  return [body, { "Stripe-Signature": `t=${t},v1=${v1}` }];
}

let failed = false;
try {
  await up();
  let r = await get("/status", { Origin: "https://www.hakoshop.com" });
  let s = await r.json();
  assert.equal(r.headers.get("access-control-allow-origin"), "https://www.hakoshop.com");
  assert.deepEqual([s.open, s.total, s.left, s.available], [true, 2, 2, 2]);
  assert.ok(s.countries.includes("JP") && !s.countries.includes("RU"));
  console.log("ok status");

  assert.equal((await post("/checkout", { country: "XX" })).status, 400);
  assert.equal((await post("/checkout", { country: "RU" })).status, 400);
  console.log("ok rejects bad countries");

  r = await post("/checkout", { country: "jp" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, "https://checkout.stripe.test/cs_test_1");
  const c1 = calls.find((c) => c.url === "/v1/checkout/sessions").params;
  assert.equal(c1["shipping_address_collection[allowed_countries][0]"], "JP");
  assert.equal(c1["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], "6900");
  assert.equal(c1["line_items[0][price]"], "price_test");
  assert.match(c1.success_url, /thanks\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(calls[0].auth, "Bearer sk_test_x");
  console.log("ok checkout JP: shipping 6900, country locked");

  r = await post("/checkout", { country: "US" });
  assert.equal(r.status, 200);
  assert.equal(calls.filter((c) => c.url === "/v1/checkout/sessions")[1]
    .params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], "1500");
  r = await post("/checkout", { country: "DE" });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "all_held");
  console.log("ok both units held -> third checkout refused");

  let [body, h] = signed({ type: "checkout.session.expired", data: { object: { id: "cs_test_2", metadata: { edition: "founder" } } } });
  assert.equal((await post("/webhook", body, h)).status, 200);
  r = await post("/checkout", { country: "DE" });
  assert.equal(r.status, 200, "expired checkout frees its unit");
  console.log("ok expired checkout releases the unit");

  assert.deepEqual(await (await get("/order?session_id=cs_test_1")).json(), { pending: true });
  sessions.cs_test_1.payment_status = "paid";
  sessions.cs_test_1.customer_details = { email: "a@example.com" };
  assert.deepEqual(await (await get("/order?session_id=cs_test_1")).json(), { number: 1 });
  console.log("ok thanks page: pending, then founder #1");

  [body, h] = signed({ type: "checkout.session.completed", data: { object: { ...sessions.cs_test_1 } } });
  await post("/webhook", body, h);
  sessions.cs_test_3.payment_status = "paid";
  [body, h] = signed({ type: "checkout.session.completed", data: { object: { ...sessions.cs_test_3 } } });
  assert.equal((await post("/webhook", body, h)).status, 200);
  assert.deepEqual(await (await get("/order?session_id=cs_test_3")).json(), { number: 2 });
  assert.ok(calls.some((c) => c.url === "/v1/payment_intents/pi_3" && c.params["metadata[founder_number]"] === "2"));
  console.log("ok webhook: duplicate completion ignored, next buyer is #2, number saved on payment");

  [body] = signed({ type: "checkout.session.completed", data: { object: {} } });
  assert.equal((await post("/webhook", body, { "Stripe-Signature": "t=1,v1=bad" })).status, 400);
  console.log("ok bad webhook signature rejected");

  // --- waitlist ---
  const O = { Origin: "https://www.hakoshop.com" };
  r = await post("/signup", { email: " Ada@Example.com ", lang: "ja" }, O);
  assert.deepEqual(await r.json(), { ok: true, new: true });
  r = await post("/signup", { email: "ada@example.com", lang: "en" }, O);
  assert.deepEqual(await r.json(), { ok: true, new: false }, "same email (any case) is one row");
  await post("/signup", { email: "=cmd@evil.com", lang: "xx" }, O);
  assert.equal((await post("/signup", { email: "not-an-email" }, O)).status, 400);
  assert.equal((await post("/signup", { email: "bob@example.com" })).status, 403, "no Origin -> refused");
  assert.equal((await post("/signup", { email: "bot@example.com", botcheck: "on" }, O)).status, 200);
  assert.equal((await (await get("/status")).json()).signups, 2, "honeypot not stored");
  assert.equal((await get("/signups.csv?token=wrong")).status, 404);
  assert.equal((await get("/signups.csv")).status, 404);
  const csv = await (await get("/signups.csv?token=tok_test_123")).text();
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3, csv);
  assert.match(lines[0], /^"email","joined \(UTC\)","page language","country"$/);
  assert.match(lines[1], /^"ada@example.com","20\d\d-.*","ja",""$/);
  assert.match(lines[2], /^"'=cmd@evil.com",.*"en",""$/, "formula defused, unknown lang -> en");
  console.log("ok waitlist: dedupe, validation, origin check, honeypot, private CSV export");

  s = await (await get("/status")).json();
  assert.deepEqual([s.sold, s.left], [2, 0]);
  r = await post("/checkout", { country: "US" });
  assert.equal((await r.json()).error, "sold_out");
  console.log("ok sold out after 2 of 2");
} catch (e) {
  failed = true;
  console.error(e);
  console.error(log.slice(-3000));
} finally {
  try { process.kill(-dev.pid, "SIGTERM"); } catch {} // the whole wrangler process group
  stripe.close();
}
process.exit(failed ? 1 : 0);
