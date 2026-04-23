import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.local.example to .env.local."
  );
}

// Solo-mode architecture: all Supabase access lives in Server Components /
// Server Actions, so we use the service role key server-side. It bypasses RLS
// + grant checks and never reaches the browser (no NEXT_PUBLIC_ prefix). When
// multi-user auth + RLS policies land, narrow the per-request client.
const key = typeof window === "undefined" ? serviceKey ?? anonKey : anonKey;

if (!key) {
  throw new Error(
    typeof window === "undefined"
      ? "Missing SUPABASE_SERVICE_ROLE_KEY (server) or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add one to .env.local."
      : "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url!, key, {
  auth: { persistSession: false },
});
