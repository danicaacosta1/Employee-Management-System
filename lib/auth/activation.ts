import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole } from "./roles";
import { isAuthorizedAccount } from "./accounts";

type Claim = { employee_id: string; role: string; claim_token: string };
type AuthUser = { user_id: string; email_confirmed: boolean };

/** All profile lookup and mutation RPCs here are executable only by service_role. */
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
  let sent = false;
  try {
    const resolve = async (): Promise<AuthUser | undefined> => {
      const result = await admin.rpc("activation_auth_user", args);
      if (result.error) throw new Error("Activation reconciliation failed");
      return (result.data as AuthUser[] | null)?.[0];
    };
    let user = await resolve();
    if (!user) {
      // Unlike inviteUserByEmail, generateLink creates the user without sending.
      // Link the profile first so a delivered email never precedes provisioning.
      const generated = await admin.auth.admin.generateLink({
        type: "invite", email, options: { redirectTo },
      });
      if (!generated.error && generated.data.user) {
        user = {
          user_id: generated.data.user.id,
          email_confirmed: !!generated.data.user.email_confirmed_at,
        };
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
    if (user.email_confirmed) {
      const recovery = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (recovery.error) throw new Error("Activation recovery failed");
    } else {
      const invitation = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (invitation.error) throw new Error("Activation invitation failed");
    }
    sent = true;
  } finally {
    // Retain the cooldown on failures; an abandoned process recovers after lease expiry.
    const released = await admin.rpc("release_account_activation", { ...args, p_sent: sent });
    if (released.error) throw new Error("Activation release failed");
  }
}
