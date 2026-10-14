import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRole, roleHome, type Role } from "./roles";
import { isAuthorizedAccount } from "./accounts";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  setupComplete: boolean;
};

type EmployeeRow = {
  role: string;
  first_name: string;
  account_status: string;
  setup_completed_at: string | null;
};

/** Verified user + employee profile for this request, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Supabase validates expiry with Date.now(). Do this only for a real request,
  // never during authenticated partial prerender/prefetch evaluation.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  // Narrow bootstrap RPC permits invited users to finish setup without granting
  // pre-activation access to employee profile or portal tables.
  const { data: profile } = await supabase.rpc("session_profile");
  const row = (profile as EmployeeRow[] | null)?.[0];

  if (!row || !["invited", "active"].includes(row.account_status) || !isRole(row.role)) return null;
  if (!isAuthorizedAccount(String(claims.email ?? ""), row.role)) return null;

  return {
    id: claims.sub,
    email: String(claims.email ?? ""),
    role: row.role,
    firstName: row.first_name,
    setupComplete: row.account_status === "active" && row.setup_completed_at !== null,
  };
});

/** Signed-in user who may still need first-time setup. */
export async function requireUser() {
  const user = await getSessionUser();
  // Sign out first so a session without a usable profile cannot loop via the proxy.
  if (!user) redirect("/auth/signout");
  return user;
}

/** Signed-in, fully set-up user with the given role. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (!user.setupComplete) redirect("/setup");
  if (user.role !== role) redirect(roleHome(user.role));
  return user;
}

/** Public entry screens remain available only until a usable session exists. */
export async function redirectAuthenticatedUser() {
  const user = await getSessionUser();
  if (user) redirect(user.setupComplete ? roleHome(user.role) : "/setup");
}
