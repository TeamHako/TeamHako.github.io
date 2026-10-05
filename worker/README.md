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

## One-time setup (about 15 minutes, all in the browser)

A GitHub Action (`.github/workflows/shop-worker-deploy.yml`) tests and deploys the
Worker whenever `worker/` changes on `main`. Every credential is a GitHub secret on
this repo: never in the code, never in chat.

Do it all with Stripe in **test mode** first (toggle at the top right of the Stripe
dashboard). Test mode has its own keys and its own price ID.

1. **Cloudflare API token.** dash.cloudflare.com → My Profile → API Tokens → Create Token
   → template **Edit Cloudflare Workers** → Account Resources: your account → Create.
   (If you still have the token you made for the sponsor CRM, you can reuse it.)
2. **Cloudflare account ID.** dash.cloudflare.com → Workers & Pages → copy *Account ID*
   from the right-hand side.
3. **Add them to this repo:** github.com/TeamHako/TeamHako.github.io → Settings →
   Secrets and variables → Actions → **New repository secret**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Stripe price ID** (`price_...`) is set in `wrangler.toml`. A repository variable
   `STRIPE_PRICE_ID` (Settings → Secrets and variables → Actions → **Variables**)
   overrides it, which is handy for switching between test and live prices.
5. **Stripe key.** Stripe → Developers → API keys → **Create restricted key** with
   **Checkout Sessions: Write** and **Payment Intents: Write**, nothing else. Add it as the
   secret `STRIPE_SECRET_KEY` (starts with `rk_test_`).
6. **Deploy.** GitHub → Actions → *Shop Worker deploy* → Run workflow. The run's summary
   shows the Worker URL, e.g. `https://hako-shop.<you>.workers.dev`.
7. **Webhook.** Stripe → Developers → Webhooks → Add endpoint:
   - URL: `<Worker URL>/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`

   Copy its signing secret (`whsec_...`) into the secret `STRIPE_WEBHOOK_SECRET`, then
   run the workflow again.
8. **Point the site at it.** Set `window.SHOP_API` to the Worker URL in `index.html` and
   `thanks.html`.
9. **Turn off the old Payment Link** (Stripe → Payment Links → ⋯ → Deactivate). It
   bypasses the 25-unit limit and the founder numbers.

To test a purchase, set the variable `PREORDERS_OPEN` to `true`, run the workflow, and
buy with card `4242 4242 4242 4242`. Then set it back to `false`.

**Going live:** in Stripe's live mode, repeat steps 4, 5 and 7 (live price ID, `rk_live_`
key, live webhook secret), replace the GitHub secrets and variable, and run the workflow.

**Without GitHub Actions:** from `worker/`, `npm install`, `npx wrangler login`,
`npx wrangler deploy`, then `npx wrangler secret put STRIPE_SECRET_KEY` and
`npx wrangler secret put STRIPE_WEBHOOK_SECRET`.

## Opening pre-orders

Set the repository variable `PREORDERS_OPEN` to `true` and run the deploy workflow.
Until then the site shows the live counter but checkout stays closed.

## Day to day

- **Who's number what:** Stripe → Payments → open a payment → Metadata.
- **Refunds:** refund in Stripe as normal. The unit isn't put back on sale automatically
  (so numbers stay unique); to sell it again, raise `FOUNDER_TOTAL` in `wrangler.toml` by 1 and push.
- **Test locally:** `npm test` runs the Worker against a fake Stripe.
