import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SESSION_SCOPE_COOKIE } from "@/lib/supabase/cookies";

/**
 * Clears a session that has no usable employee profile (e.g. disabled).
 * Used by the DAL, which cannot write cookies while rendering.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  response.cookies.delete(SESSION_SCOPE_COOKIE);
  return response;
}
