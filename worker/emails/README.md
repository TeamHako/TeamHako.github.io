# Waitlist emails

Ready-to-paste drafts for the hako waitlist, in the three site languages. Each
file has the subject, the preview text (the grey line inboxes show after the
subject), and the body.

| File | When it goes out |
|---|---|
| `confirm.<lang>.md` | Right after someone signs up: double opt-in. Nothing else is sent until they click. |
| `welcome.<lang>.md` | Right after they confirm. |

## Setting them up in Kit

1. **Sender:** hello@hakoshop.com. Kit → Settings → Email → verify the domain
   (it gives you DNS records to add at Cloudflare) so mail isn't sent "via kit".
2. **Address in the footer:** CAN-SPAM requires a real postal address on every
   marketing email. Use a PO box or a virtual mailbox, not your home.
3. **Forms:** one Kit form per language (hako waitlist EN / JA / DE). On each:
   Settings → Incentive → *Send incentive email* on (that's the double opt-in),
   paste `confirm.<lang>.md` into it; the button text is the line marked
   **Button**.
4. **Welcome:** a sequence per language with one email, `welcome.<lang>.md`,
   started by "subscribes to form …".
5. **Tags:** `devlog` for people who ticked the devlog box. The welcome email's
   devlog link should be a Kit link trigger that adds the tag.
6. **Connecting the site:** once the forms exist, the Worker's `/signup` can
   pass each sign-up to Kit (form by language, `devlog` tag) with a
   `KIT_API_KEY` secret, so nobody is imported by hand. Until then, export
   `/signups.csv` and import it into Kit.

These files are in a public repo, which is fine: they're what every subscriber
receives anyway. Don't put list data, keys or addresses here.
