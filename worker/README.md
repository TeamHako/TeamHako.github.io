# hako shop Worker

Runs Founder Edition checkout for hakoshop.com on Cloudflare Workers (free plan):

- **Never oversells.** A unit is held while someone is in checkout (30 minutes, Stripe's
  minimum) and sold when Stripe confirms payment. One Durable Object keeps the count, so
  two people can't both buy the 25th box.
- **Shipping by country.** The buyer picks their country on the site; checkout is locked
  to that country with its shipping price (`SHIPPING_CENTS` in `wrangler.toml`).
- **Founder numbers** go to buyers in the order they pay. The thanks page shows the
  number, and it's saved on the payment in Stripe (Payments → the payment → Metadata →
  `founder_number`).
- **Live counter** on the site ("N of 25 left").

Your Stripe secret key lives only in Cloudflare as an encrypted secret. It's never in
this repo, on the website, or in chat.

## One-time setup (about 15 minutes)

1. **Price ID.** Stripe → Product catalog → *hako — Founder Edition* → under Pricing,
   click the price and copy its ID (`price_...`). Put it in `wrangler.toml` as
   `STRIPE_PRICE_ID`.
2. **Shipping prices.** Check real quotes for a boxed unit (weigh one) on
   Pirate Ship or your carrier, and set `SHIPPING_CENTS` (US cents; `"*"` = everywhere else).
3. **Deploy:**
   ```sh
   cd worker
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
   It prints the Worker's URL, e.g. `https://hako-shop.<you>.workers.dev`.
4. **Stripe secret key.** Stripe → Developers → API keys → create a *restricted key*
   with **Checkout Sessions: Write** and **Payment Intents: Write** (nothing else), then:
   ```sh
   npx wrangler secret put STRIPE_SECRET_KEY
   ```
   and paste it when asked.
5. **Webhook.** Stripe → Developers → Webhooks → Add endpoint:
   - URL: `https://hako-shop.<you>.workers.dev/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`

   Copy its signing secret (`whsec_...`), then:
   ```sh
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
6. **Point the site at it.** Set `window.SHOP_API` to the Worker URL in `index.html`
   *and* `thanks.html`, then push the site.
7. **Turn off the old Payment Link** (Stripe → Payment Links → ⋯ → Deactivate). It
   bypasses the 25-unit limit and the founder numbers.

Do steps 1–6 with Stripe in **test mode** first (test keys, test webhook) and buy one with
card `4242 4242 4242 4242`. Then repeat 4–5 with live keys.

## Opening pre-orders

Set `PREORDERS_OPEN = "true"` in `wrangler.toml` and run `npx wrangler deploy`. Until
then the site shows the live counter but checkout stays closed.

## Day to day

- **Who's number what:** Stripe → Payments → open a payment → Metadata.
- **Refunds:** refund in Stripe as normal. The unit isn't put back on sale automatically
  (so numbers stay unique); to sell it again, raise `FOUNDER_TOTAL` by 1 and redeploy.
- **Test locally:** `npm test` runs the Worker against a fake Stripe.
