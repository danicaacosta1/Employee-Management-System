"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SESSION_SCOPE_COOKIE } from "@/lib/supabase/cookies";
import { getSessionUser } from "./dal";
import { roleHome, rolePrefix, safeNext } from "./roles";
import { appOrigin } from "./callback";
import { emailForUsername, sendActivation } from "./activation";
import { isAuthorizedAccount } from "./accounts";
import {
  normalizeEmail,
  validateConfirm,
  validateEmail,
  validateEmployeeCode,
  validatePassword,
  validateUsername,
} from "./validation";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const LOGIN_FAILED =
  "We couldn't sign you in. Please review your username or email and password, then try again.";
const SETUP_FAILED =
  "We couldn't complete your account setup. Please review your username and password, then try again.";
const UNAVAILABLE = "Service is temporarily unavailable. Please try again shortly.";

function compact(errors: Record<string, string | null>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) if (value) out[key] = value;
  return Object.keys(out).length ? out : undefined;
}

export async function activateAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("employeeId") ?? "").trim().toUpperCase();
  const email = normalizeEmail(formData.get("email"));
  const values = { employeeId: code, email };

  const fieldErrors = compact({
    employeeId: validateEmployeeCode(code),
    email: validateEmail(email),
  });
  if (fieldErrors) return { fieldErrors, values };

  try {
    await sendActivation(createAdminClient(), code, email,
      `${appOrigin()}/auth/confirm?next=/setup`);
  } catch {
    // Keep outcomes uniform, including unknown/disabled/active profiles and cooldowns.
    // Do not log email, employee code, tokens, or the secret-key client response.
    console.error("Account activation request failed");
  }

  return {
    success:
      "If your account is eligible, a temporary username and password will be sent to your company email.",
    values,
  };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const login = normalizeEmail(formData.get("login"));
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const next = safeNext(formData.get("next"));
  const values = { login, remember: remember ? "on" : "" };

  const byEmail = login.includes("@");
  const fieldErrors = compact({
    login: !login ? "Username or email is required." : byEmail ? validateEmail(login) : null,
    password: password ? null : "Password is required.",
  });
  if (fieldErrors) return { fieldErrors, values };

  let email = login;
  if (!byEmail) {
    if (validateUsername(login)) return { error: LOGIN_FAILED, values };
    try {
      email = (await emailForUsername(createAdminClient(), login)) ?? "";
    } catch {
      console.error("Username lookup failed");
      return { error: UNAVAILABLE, values };
    }
  }
  if (!isAuthorizedAccount(email)) return { error: LOGIN_FAILED, values };

  const cookieStore = await cookies();
  if (remember) cookieStore.delete(SESSION_SCOPE_COOKIE);
  else
    cookieStore.set(SESSION_SCOPE_COOKIE, "browser", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

  const supabase = await createClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "over_request_rate_limit")
      return { error: "Too many sign-in attempts. Please wait a few minutes and try again.", values };
    if (error.status && error.status >= 500) return { error: UNAVAILABLE, values };
    return { error: LOGIN_FAILED, values };
  }

  const user = await getSessionUser();
  if (!user) {
    // Auth user with no active employee profile (e.g. disabled): refuse.
    await supabase.auth.signOut();
    return { error: LOGIN_FAILED, values };
  }

  if (!user.setupComplete) redirect("/setup");
  const prefix = rolePrefix(user.role);
  redirect(next && next.startsWith(`${prefix}/`) ? next : roleHome(user.role));
}

export async function completeSetup(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const values = { username };

  const fieldErrors = compact({
    username: validateUsername(username),
    password: validatePassword(password),
    confirm: validateConfirm(password, confirm),
  });
  if (fieldErrors) return { error: SETUP_FAILED, fieldErrors, values };

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.setupComplete) redirect(roleHome(user.role));

  const supabase = await createClient();
  // New credentials must replace the temporary ones from the activation email.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const temp = authUser?.user_metadata ?? {};
  const reused = compact({
    username: temp.temp_username && username === temp.temp_username
      ? "Choose a new username, not the temporary one." : null,
    password: temp.temp_password && password === temp.temp_password
      ? "Choose a new password, not the temporary one." : null,
  });
  if (reused) return { error: SETUP_FAILED, fieldErrors: reused, values };

  // Clearing the temporary metadata also removes it from future recovery emails.
  const { error: passwordError } = await supabase.auth.updateUser({
    password, data: { temp_username: null, temp_password: null },
  });
  // A previous attempt may have saved the password before the username RPC failed.
  // Reusing that password must allow an incomplete account to retry onboarding.
  if (passwordError && passwordError.code !== "same_password") {
    if (passwordError.code === "weak_password")
      return {
        error: SETUP_FAILED,
        fieldErrors: { password: passwordError.message },
        values,
      };
    return { error: SETUP_FAILED, values };
  }

  const { error: rpcError } = await supabase.rpc("complete_first_time_setup", {
    p_username: username,
  });
  if (rpcError) {
    if (rpcError.code === "23505")
      return { error: SETUP_FAILED, fieldErrors: { username: "This username is already taken." }, values };
    return { error: SETUP_FAILED, values };
  }

  redirect(roleHome(user.role));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get("email"));
  const values = { email };
  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, values };

  try {
    if (isAuthorizedAccount(email)) {
      const admin = createAdminClient();
      const eligible = await admin.rpc("can_recover_account", { p_email: email });
      if (!eligible.error && eligible.data === true) {
        // Supabase alone creates and delivers the recovery token through its SMTP provider.
        const supabase = await createClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${appOrigin()}/auth/confirm?next=/reset-password`,
        });
      }
    }
  } catch {
    console.error("Password recovery request failed");
  }

  // Identical response whether or not the account exists.
  return {
    success: "If an account exists for this email, a password reset link has been sent.",
    values,
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors = compact({
    password: validatePassword(password),
    confirm: validateConfirm(password, confirm),
  });
  if (fieldErrors) return { fieldErrors };

  const user = await getSessionUser();
  if (!user) redirect("/auth/error?reason=link-expired");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password")
      return { fieldErrors: { password: error.message } };
    return { error: "We couldn't update your password. Please try again." };
  }
  await supabase.auth.signOut({ scope: "others" });

  // Recovery never bypasses activation: unfinished accounts go to setup.
  redirect(user.setupComplete ? roleHome(user.role) : "/setup");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(SESSION_SCOPE_COOKIE);
  redirect("/login");
}
