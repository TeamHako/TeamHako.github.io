/**
 * hako shop Worker — Founder Edition pre-orders.
 *
 *   GET  /status                 units left, whether pre-orders are open, countries + shipping
 *   POST /checkout {country}     reserves a unit and returns a Stripe Checkout URL
 *   GET  /order?session_id=...   the buyer's founder number (thanks page)
 *   POST /webhook                Stripe events: checkout.session.completed / .expired
 *
 * One Durable Object ("Founders") holds the count, so two people can never
 * buy the 25th unit. A unit is reserved while its checkout is open (Stripe
 * checkouts expire after 30 minutes) and becomes a sale, with the next
 * founder number, once Stripe reports it paid.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (wrangler secret put).
 */

const RESERVE_SECONDS = 30 * 60; // Stripe's minimum checkout lifetime

// Countries Stripe Checkout can't ship to, plus destinations US export rules
// or carriers rule out for electronics, plus uninhabited territories.
const BLOCKED = new Set([
  "AS", "CC", "CU", "CX", "FM", "HM", "IR", "KP", "MH", "MP", "NF", "PW", "SD", "SY", "UM", "VI",
  "RU", "BY",
  "AQ", "BV", "GS", "IO", "TF",
]);
const ISO_COUNTRIES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR " +
  "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ " +
  "EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW " +
  "GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY " +
  "KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV " +
  "MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
  "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG " +
  "TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
export const COUNTRIES = ISO_COUNTRIES.filter((c) => !BLOCKED.has(c));

// ---------------------------------------------------------------------------
// Durable Object: the single source of truth for units and numbers
// ---------------------------------------------------------------------------
export class Founders {
  constructor(state, env) {
    this.storage = state.storage;
    this.total = Number(env.FOUNDER_TOTAL || 25);
  }

  async load() {
    const [sales, holds] = await Promise.all([
      this.storage.get("sales"),
      this.storage.get("holds"),
    ]);
    const now = Math.floor(Date.now() / 1000);
    const live = {};
    for (const [id, until] of Object.entries(holds || {})) {
      if (until > now) live[id] = until;
    }
    return { sales: sales || {}, holds: live };
  }

  summary({ sales, holds }) {
    const sold = Object.keys(sales).length;
    const held = Object.keys(holds).length;
    return { total: this.total, sold, held, left: Math.max(this.total - sold, 0),
             available: Math.max(this.total - sold - held, 0) };
  }

  async fetch(request) {
    const { op, sessionId, until, info } = await request.json();
    const data = await this.load();

    if (op === "status") {
      return Response.json(this.summary(data));
    }

    if (op === "hold") {
      // Called before creating the Stripe session; the hold id is temporary
      // until the real session id is known.
      if (this.summary(data).available <= 0) {
        return Response.json({ ok: false, ...this.summary(data) });
      }
      data.holds[sessionId] = until;
      await this.storage.put("holds", data.holds);
      return Response.json({ ok: true });
    }

    if (op === "rename") {
      // Temporary hold id -> Stripe session id
      const { to } = info;
      if (data.holds[sessionId]) {
        data.holds[to] = data.holds[sessionId];
        delete data.holds[sessionId];
        await this.storage.put("holds", data.holds);
      }
      return Response.json({ ok: true });
    }

    if (op === "release") {
      delete data.holds[sessionId];
      await this.storage.put("holds", data.holds);
      return Response.json({ ok: true });
    }

    if (op === "complete") {
      // Idempotent: the webhook and the thanks page may both report a sale.
      if (!data.sales[sessionId]) {
        const number = Object.keys(data.sales).length + 1;
        data.sales[sessionId] = { number, at: Math.floor(Date.now() / 1000), ...info };
        delete data.holds[sessionId];
        await this.storage.put({ sales: data.sales, holds: data.holds });
      }
      return Response.json({ number: data.sales[sessionId].number });
    }

    if (op === "lookup") {
      const sale = data.sales[sessionId];
      return Response.json(sale ? { number: sale.number } : {});
    }

    return new Response("unknown op", { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function founders(env, body) {
  const stub = env.FOUNDERS.get(env.FOUNDERS.idFromName("founder-edition"));
  return stub
    .fetch("https://founders/", { method: "POST", body: JSON.stringify(body) })
    .then((r) => r.json());
}

function shippingTable(env) {
  try {
    return JSON.parse(env.SHIPPING_CENTS || "{}");
  } catch {
    return {};
  }
}

export function shippingCents(env, country) {
  const table = shippingTable(env);
  return table[country] ?? table["*"] ?? 0;
}

function stripeBase(env) {
  return env.STRIPE_API_BASE || "https://api.stripe.com";
}

async function stripe(env, method, path, params) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  };
  if (params) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(stripeBase(env) + path, init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path}: ${data?.error?.message || res.status}`);
  }
  return data;
}

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const headers = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });
}

// Stripe webhook signature: header "t=...,v1=..." over `${t}.${body}`
export async function verifyStripeSignature(body, header, secret, toleranceS = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=")).filter((p) => p.length === 2),
  );
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceS) return false;
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
                                            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => s.length === expected.length &&
    [...s].reduce((diff, ch, i) => diff | (ch.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

function saleInfo(session) {
  return {
    email: session.customer_details?.email || "",
    country: session.shipping_details?.address?.country ||
             session.collected_information?.shipping_details?.address?.country || "",
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function handleStatus(env, cors) {
  const s = await founders(env, { op: "status" });
  return json({
    open: env.PREORDERS_OPEN === "true",
    ...s,
    shipping: shippingTable(env),
    countries: COUNTRIES,
  }, 200, cors);
}

async function handleCheckout(request, env, cors) {
  if (env.PREORDERS_OPEN !== "true") return json({ error: "not_open" }, 403, cors);
  let country = "";
  try {
    country = String((await request.json()).country || "").toUpperCase();
  } catch {
    // fall through to the validation below
  }
  if (!COUNTRIES.includes(country)) return json({ error: "bad_country" }, 400, cors);

  const until = Math.floor(Date.now() / 1000) + RESERVE_SECONDS + 60;
  const holdId = `hold_${crypto.randomUUID()}`;
  const hold = await founders(env, { op: "hold", sessionId: holdId, until });
  if (!hold.ok) {
    return json({ error: hold.left > 0 ? "all_held" : "sold_out" }, 409, cors);
  }

  const site = env.SITE_URL.replace(/\/$/, "");
  // The test shop adds "shop=test" so the site keeps talking to it after checkout
  const q = env.SITE_QUERY || "";
  const cents = shippingCents(env, country);
  let session;
  try {
    session = await stripe(env, "POST", "/v1/checkout/sessions", {
      mode: "payment",
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": "1",
      "shipping_address_collection[allowed_countries][0]": country,
      "shipping_options[0][shipping_rate_data][display_name]":
        country === "US" ? "Tracked shipping" : "Tracked international shipping",
      "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
      "shipping_options[0][shipping_rate_data][fixed_amount][amount]": String(cents),
      "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
      "phone_number_collection[enabled]": "true",
      "custom_text[submit][message]":
        "Pre-order: built by hand and shipped in about 6–8 weeks. Full refund any time before it ships." +
        (country === "US" ? "" : " Import tax may be due on delivery."),
      allow_promotion_codes: "true",
      expires_at: String(Math.floor(Date.now() / 1000) + RESERVE_SECONDS),
      "metadata[edition]": "founder",
      "payment_intent_data[metadata][edition]": "founder",
      success_url: `${site}/thanks.html?session_id={CHECKOUT_SESSION_ID}${q ? `&${q}` : ""}`,
      cancel_url: `${site}/${q ? `?${q}` : ""}#founders`,
    });
  } catch (e) {
    await founders(env, { op: "release", sessionId: holdId });
    console.error(e);
    return json({ error: "stripe" }, 502, cors);
  }
  await founders(env, { op: "rename", sessionId: holdId, info: { to: session.id } });
  return json({ url: session.url }, 200, cors);
}

async function handleOrder(url, env, cors) {
  const id = url.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "bad_session" }, 400, cors);
  const known = await founders(env, { op: "lookup", sessionId: id });
  if (known.number) return json(known, 200, cors);
  // The buyer can land here before Stripe's webhook arrives: ask Stripe.
  let session;
  try {
    session = await stripe(env, "GET", `/v1/checkout/sessions/${id}`);
  } catch {
    return json({ error: "not_found" }, 404, cors);
  }
  if (session.payment_status !== "paid" || session.metadata?.edition !== "founder") {
    return json({ pending: true }, 200, cors);
  }
  return json(await founders(env, { op: "complete", sessionId: id, info: saleInfo(session) }), 200, cors);
}

async function handleWebhook(request, env) {
  const body = await request.text();
  const ok = await verifyStripeSignature(body, request.headers.get("Stripe-Signature"),
                                         env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(body);
  const session = event.data?.object || {};
  if (session.metadata?.edition !== "founder") return new Response("ignored");

  if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
    const r = await founders(env, { op: "complete", sessionId: session.id, info: saleInfo(session) });
    // Put the number on the payment, so it's visible in the Stripe dashboard
    if (session.payment_intent) {
      try {
        await stripe(env, "POST", `/v1/payment_intents/${session.payment_intent}`,
                     { "metadata[founder_number]": String(r.number) });
      } catch (e) {
        console.error(e);
      }
    }
  } else if (event.type === "checkout.session.expired") {
    await founders(env, { op: "release", sessionId: session.id });
  }
  return new Response("ok");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === "/status" && request.method === "GET") return await handleStatus(env, cors);
      if (url.pathname === "/checkout" && request.method === "POST") return await handleCheckout(request, env, cors);
      if (url.pathname === "/order" && request.method === "GET") return await handleOrder(url, env, cors);
      if (url.pathname === "/webhook" && request.method === "POST") return await handleWebhook(request, env);
    } catch (e) {
      console.error(e);
      return json({ error: "server" }, 500, cors);
    }
    return new Response("not found", { status: 404 });
  },
};
