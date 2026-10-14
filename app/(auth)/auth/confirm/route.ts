import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, callbackDestination } from "@/lib/auth/callback";
import { isAuthorizedAccount } from "@/lib/auth/accounts";
import { isRole } from "@/lib/auth/roles";

/**
 * Landing route for invite and recovery email links. Supports the token_hash
 * template format and PKCE `code` links; establishes the session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = callbackDestination(type, requestedNext);
  const origin = appOrigin();
  const redirectTo = (destination: string) => {
    const response = NextResponse.redirect(new URL(destination, origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };

  const validToken = !code && tokenHash && next && (type === "invite" || type === "recovery");
  const validCode = !tokenHash && !type && code && requestedNext === "/reset-password";
  if (searchParams.has("error") || searchParams.has("error_code") || (!validToken && !validCode)) {
    return redirectTo("/auth/error?reason=link-expired");
  }

  let ok = false;
  let destination = next ?? "/reset-password";
  let failure = "link-expired";
  let supabase: Awaited<ReturnType<typeof createClient>> | undefined;
  try {
    // Route Handlers can write cookies. A failed write must not look like expiry.
    supabase = await createClient({ strictCookies: true });
    if (validToken && tokenHash && (type === "invite" || type === "recovery")) {
      ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    } else if (validCode && code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
    if (ok) {
      failure = "account-unavailable";
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profiles, error } = await supabase.rpc("session_profile");
      const profile = profiles?.[0];
      ok = !error && !!user?.email && !!profile && isRole(profile.role)
        && isAuthorizedAccount(user.email, profile.role)
        && ["invited", "active"].includes(profile.account_status);
      if (!ok) await supabase.auth.signOut();
      else if (profile.account_status !== "active" || !profile.setup_completed_at) {
        // A recovery link can also resume setup for an already-confirmed invitee.
        destination = "/setup";
      }
    }
  } catch {
    // Tokens and provider responses must never reach logs or error pages.
    ok = false;
    failure = "session-failed";
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
  }

  return redirectTo(ok ? destination : `/auth/error?reason=${failure}`);
}
