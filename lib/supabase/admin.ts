import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged client using the secret key. Bypasses RLS: only call from
 * server actions after validating input. Never import from client code.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not configured");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
