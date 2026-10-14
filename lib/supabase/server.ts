import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SESSION_SCOPE_COOKIE, scopeCookieOptions } from "./cookies";

/**
 * Request-scoped Supabase client acting as the signed-in user (RLS applies).
 * `sessionOnly` overrides the scope cookie, used at login before it is set.
 */
export async function createClient(opts: { sessionOnly?: boolean; strictCookies?: boolean } = {}) {
  const cookieStore = await cookies();
  const sessionOnly =
    opts.sessionOnly ??
    cookieStore.get(SESSION_SCOPE_COOKIE)?.value === "browser";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, scopeCookieOptions(options, sessionOnly)),
            );
          } catch (error) {
            if (opts.strictCookies) throw error;
            // Called from a Server Component; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
