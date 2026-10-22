# Turning on accounts, cloud save and the $6.99 unlock

Aquestoria works right now in **local mode** (no login, data stays in the browser). To switch on accounts + payments you need two free services. Do everything in **test mode first**.

## 1. Supabase (accounts + saved data)

1. Create a free project at supabase.com.
2. **SQL Editor → New query →** paste all of `backend/setup.sql` → **Run**. (This creates the tables and the 168-hour trial rule.)
3. **Authentication → URL Configuration:** set _Site URL_ to your website's address (and add it under _Redirect URLs_).
4. **Authentication → Providers → Email:** while testing you can turn "Confirm email" off. Turn it back on before launch.
5. **Project Settings → API:** copy the _Project URL_ and the _anon public_ key into `config.js`.

> **Already ran `setup.sql` before?** Run it again. It is safe to re-run, and it adds the "delete my account" function.

## 2. Stripe (the one-time payment)

1. Create a Stripe account → **Products →** add a product, price **$6.99, one-time**.
2. **Payment Links → New →** pick that product → copy the link into `stripePaymentLink` in `config.js`.
3. Deploy the webhook. **Easiest way, no installs (in your browser):**
   - Supabase dashboard → **Edge Functions → Deploy a new function → Via Editor**. Name it `stripe-webhook`.
   - Delete the sample code and paste in everything from `backend/stripe-webhook.ts`. Click **Deploy**.
   - Open the function's settings and turn **off** "Enforce JWT verification" (Stripe isn't a logged-in user).
   - **Edge Functions → Secrets**: add `STRIPE_SECRET_KEY` (starts `sk_test_`) and `STRIPE_WEBHOOK_SECRET` (you get this in the next step).
   - (Advanced alternative with the Supabase CLI: `supabase functions deploy stripe-webhook --no-verify-jwt`.)
     Red squiggles about `Deno` or `https://esm.sh/...` when you open the file in VS Code are normal. Ignore them.
4. Stripe **Developers → Webhooks → Add endpoint:** URL = `https://<your-project>.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret into the `STRIPE_WEBHOOK_SECRET` secret above.
5. Test with Stripe's test card `4242 4242 4242 4242`. After paying, the paywall should disappear within seconds.

## 3. Host it

Any static host with **https** (Netlify, GitHub Pages, Cloudflare Pages). Notifications and the service worker need https.

## Before charging real money

- Add a **Terms of Service, Privacy Policy and refund policy** page and link them from the sign-up screen.
- Finish Stripe's business verification and check sales-tax rules for your location.
- Switch Stripe from test to live keys/links, and re-create the webhook in live mode.

## How the 168 hours of use are counted

- While someone is **actually using** Aquestoria (tab visible and a mouse/keyboard/touch in the last 2 minutes), the app pings the database about once a minute (`record_usage`). Idle or hidden tabs send nothing, so they cost nothing.
- The **server** decides how much to credit: never more than the real time since the last ping (max 70 seconds per ping). Pinging faster doesn't speed anything up, and the first ping after starting or resuming credits nothing.
- The allowance (`trial_seconds`, 168 h = 604800) and the usage counter live in the database. The browser can read them but cannot change them, and the database rejects saving data once the allowance is used up and nothing is paid.
- **Backstop:** free hours also expire 180 days after sign-up (`trial_ends_at` in `backend/setup.sql`), so nobody can stretch the trial forever. Change or remove that interval if you disagree. The app tells users the date.
- **Honest limit:** a modified copy of the page could stop sending pings. The 180-day backstop bounds that, and the data stays protected either way. Someone can also keep using a local copy without cloud saving; that's normal for a $6.99 app.

## Reminders

Reminders use browser notifications and appear while Aquestoria is open (in a tab, window or installed app). Reminders when the browser is closed (push or email) need a server job: a possible next step.

## Deleting accounts

Settings → "Delete my account and data…" (also on the paywall). The user must type DELETE. The database function `delete_my_account` removes their login, and their profile and saved planner are deleted with it automatically; this browser's saved copy is wiped too. Stripe still keeps its own payment records (it must, for tax/legal reasons), so say so in your Privacy Policy, and handle refunds in Stripe yourself.
