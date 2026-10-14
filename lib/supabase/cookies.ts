import type { CookieOptions } from "@supabase/ssr";

/**
 * Set when "Remember this workstation" is unchecked at login. Auth cookies are
 * then written without maxAge/expires so the browser drops them on close.
 */
export const SESSION_SCOPE_COOKIE = "ems_session_scope";

export function scopeCookieOptions(
  options: CookieOptions,
  sessionOnly: boolean,
): CookieOptions {
  if (!sessionOnly) return options;
  // A deletion (maxAge 0) must keep its expiry or the cookie would never clear.
  if (options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
