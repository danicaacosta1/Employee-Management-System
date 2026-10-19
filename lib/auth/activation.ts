import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole } from "./roles";
import { isAuthorizedAccount } from "./accounts";

type Claim = { employee_id: string; role: string; claim_token: string };
type AuthUser = { user_id: string; email_confirmed: boolean };

const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

function pick(chars: string, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return out;
}

/** Temporary username: employee code plus a random suffix, e.g. `ems0002.k7q2`. */
export function temporaryUsername(code: string) {
  const base = code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  return `${base}.${pick(LOWER + DIGITS, 5)}`;
}

/** Temporary password: 12 characters with lower, upper and digit, no ambiguous glyphs. */
export function temporaryPassword() {
  const chars = [pick(LOWER, 1), pick(UPPER, 1), pick(DIGITS, 1), ...pick(LOWER + UPPER + DIGITS, 9)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Issues temporary credentials and emails them. The recovery template renders
 * `temp_username`/`temp_password` from user metadata; setup clears them.
 * All profile lookup and mutation RPCs here are executable only by service_role.
 */
export async function sendActivation(
  admin: SupabaseClient, code: string, email: string, redirectTo: string,
): Promise<void> {
  if (!isAuthorizedAccount(email)) return;
  const { data, error } = await admin.rpc("claim_account_activation", {
    p_employee_code: code, p_email: email,
  });
  if (error) throw new Error("Activation claim failed");
  const claim = (data as Claim[] | null)?.[0];
  if (!claim || !isRole(claim.role) || !isAuthorizedAccount(email, claim.role)) return;
  const args = { p_employee_id: claim.employee_id, p_claim_token: claim.claim_token };
  const password = temporaryPassword();
  let sent = false;
  try {
    const resolve = async (): Promise<AuthUser | undefined> => {
      const result = await admin.rpc("activation_auth_user", args);
      if (result.error) throw new Error("Activation reconciliation failed");
      return (result.data as AuthUser[] | null)?.[0];
    };
    let user = await resolve();
    if (!user) {
      // createUser never sends mail. Link the profile first so a delivered email
      // never precedes provisioning.
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (!created.error && created.data.user) {
        user = { user_id: created.data.user.id, email_confirmed: true };
      } else {
        // Recover a user created by an earlier partially successful request,
        // including an Auth-side race; never scan or expose the user directory.
        user = await resolve();
      }
    }
    if (!user) throw new Error("Activation user unavailable");
    const linked = await admin.rpc("link_account_activation", {
      ...args, p_user_id: user.user_id, p_role: claim.role,
    });
    if (linked.error) throw new Error("Activation link failed");
    if (linked.data !== true) return; // Lease expired, disabled, or role changed.

    // Temporary username lives on the profile so login can resolve it; retry on collision.
    let username: string | undefined;
    for (let attempt = 0; attempt < 3 && !username; attempt++) {
      const candidate = temporaryUsername(code);
      const updated = await admin.from("employees").update({ username: candidate })
        .eq("id", claim.employee_id).eq("activation_claim_token", claim.claim_token)
        .is("setup_completed_at", null).select("id");
      if (!updated.error && updated.data?.length) username = candidate;
      else if (updated.error?.code !== "23505") throw new Error("Temporary username failed");
    }
    if (!username) throw new Error("Temporary username failed");

    const credentials = await admin.auth.admin.updateUserById(user.user_id, {
      password, email_confirm: true,
      user_metadata: { temp_username: username, temp_password: password },
    });
    if (credentials.error) throw new Error("Temporary credentials failed");

    const delivery = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (delivery.error) throw new Error("Activation delivery failed");
    sent = true;
  } finally {
    // Retain the cooldown on failures; an abandoned process recovers after lease expiry.
    const released = await admin.rpc("release_account_activation", { ...args, p_sent: sent });
    if (released.error) throw new Error("Activation release failed");
  }
}

/** Resolves a login username to its account email. Service role only. */
export async function emailForUsername(admin: SupabaseClient, username: string) {
  const { data, error } = await admin.from("employees").select("email")
    .eq("username", username).in("account_status", ["invited", "active"]).limit(1);
  if (error) throw new Error("Username lookup failed");
  return (data as { email: string }[] | null)?.[0]?.email ?? null;
}
