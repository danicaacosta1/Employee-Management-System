import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_SCOPE_COOKIE, scopeCookieOptions } from "@/lib/supabase/cookies";

const PORTALS = ["/manager", "/employee"];
const NEEDS_SESSION = ["/setup", "/reset-password"];

const matches = (path: string, bases: string[]) =>
  bases.some((base) => path === base || path.startsWith(`${base}/`));

/**
 * Refreshes the Supabase session cookie and performs optimistic redirects.
 * Real authorization happens in the DAL (lib/auth/dal.ts) and RLS.
 */
export async function proxy(request: NextRequest) {
  const sessionOnly = request.cookies.get(SESSION_SCOPE_COOKIE)?.value === "browser";
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, scopeCookieOptions(options, sessionOnly)),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  const redirectTo = (target: string) => {
    const url = new URL(target, request.url);
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
    return res;
  };

  if (!claims) {
    if (path === "/") return redirectTo("/activate");
    if (matches(path, PORTALS)) return redirectTo(`/login?next=${encodeURIComponent(path)}`);
    if (path === "/reset-password") return redirectTo("/auth/error?reason=link-expired");
    if (matches(path, NEEDS_SESSION)) return redirectTo("/login");
    return response;
  }

  // Role metadata can lag a trusted profile change. Portal DAL checks the live
  // database role; routing here from stale JWT metadata can cause redirect loops.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
