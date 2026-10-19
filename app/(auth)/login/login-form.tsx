"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/auth/actions";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { KeyIcon, MailIcon } from "@/components/ui/icons";

const NOTICES: Record<string, string> = {
  "already-active": "Your account is already active. Log in with your username or company email.",
  "password-updated": "Your password has been updated. Log in with your new password.",
};

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  const noticeText = notice ? NOTICES[notice] : undefined;

  return (
    <AuthCard title="Login Account" subtitle="Sign in with your enterprise credentials">
      {state.error ? (
        <AuthAlert message={state.error} />
      ) : (
        noticeText && <AuthAlert tone="success" title="Account active" message={noticeText} />
      )}
      <form action={action} noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <TextField
          label="Username or Email"
          name="login"
          icon={MailIcon}
          placeholder="Username or company email"
          autoComplete="username"
          defaultValue={state.values?.login}
          error={state.fieldErrors?.login}
        />
        <PasswordField
          label="Password"
          name="password"
          icon={KeyIcon}
          tint="rose"
          placeholder="Password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
          aside={
            <Link
              href="/forgot-password"
              className="text-[11px] font-semibold text-[#1e3a8a] hover:underline"
            >
              Forgot Password?
            </Link>
          }
        />
        <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-[11.5px] text-slate-500">
          <input
            type="checkbox"
            name="remember"
            defaultChecked={state.values ? state.values.remember === "on" : true}
            className="size-3.5 rounded-sm accent-[#1e3a8a]"
          />
          Remember this workstation
        </label>
        <SubmitButton>Login</SubmitButton>
      </form>
      <AuthFooter>
        Don&apos;t have an active profile?{" "}
        <Link href="/activate" className="font-semibold text-[#1e3a8a] hover:underline">
          Activate Account
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
