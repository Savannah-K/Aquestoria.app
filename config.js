/* ===== Aquestoria settings: the only file you need to edit to turn on accounts + payments. See SETUP.md. =====
   Leave supabaseUrl / supabaseAnonKey empty and Aquestoria runs in "local mode" (no login, data stays in this browser). */
window.QUESTIVA_CONFIG = {
  supabaseUrl: "", // Supabase dashboard → Project Settings → API → Project URL
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90dXFjcmttaHZzZWdlb3NvaWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NTIzODIsImV4cCI6MjEwNzQyODM4Mn0.y96Yl1BxzD8hrlfd2EX8zovBBAsdTcSJ7LWuwfAkpo4", // same page → "anon public" key (safe to put in a website; the database rules protect the data)
  stripePaymentLink: "", // Stripe Payment Link for the one-time purchase, e.g. https://buy.stripe.com/xxxx
  trialHours: 168, // only used for display. The REAL trial length is set in backend/setup.sql
  price: "$6.99", // only used for display. The REAL price is the one on your Stripe Payment Link
};
