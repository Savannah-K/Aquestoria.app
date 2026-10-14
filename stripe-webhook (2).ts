// @ts-nocheck  <- hides the red squiggles in VS Code. They are false alarms: this file is written for Supabase's
//                 server (which uses "Deno"), not for your computer or your website, so your editor can't understand it.
// ===== Supabase Edge Function: marks an account as paid when Stripe says the payment succeeded. =====
// Copy this file to  supabase/functions/stripe-webhook/index.ts  and deploy it (see SETUP.md).
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try { // proves the request really came from Stripe
    event = await stripe.webhooks.constructEventAsync(body, signature!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, cryptoProvider);
  } catch (_err) {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.client_reference_id) {
      // service-role key bypasses the database rules, so only this function can set paid = true
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { error } = await admin.from("profiles")
        .update({ paid: true, paid_at: new Date().toISOString(), stripe_session: session.id })
        .eq("id", session.client_reference_id);
      if (error) return new Response("Database error", { status: 500 }); // Stripe will retry
    }
  }
  return new Response("ok");
});
