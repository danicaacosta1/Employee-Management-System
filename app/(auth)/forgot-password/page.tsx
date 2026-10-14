"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/lib/auth/actions";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { SubmitButton, TextField } from "@/components/auth/fields";
import { MailIcon } from "@/components/ui/icons";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});

  return (
    <AuthCard
      title="Forgot Password"
      subtitle="Enter your company email and we'll send you a reset link"
    >
      {state.error && <AuthAlert message={state.error} />}
      {state.success && (
        <AuthAlert tone="success" title="Check your inbox" message={state.success} />
      )}
      <form action={action} noValidate>
        <TextField
          label="Company Email"
          name="email"
          type="email"
          icon={MailIcon}
          placeholder="Email"
          autoComplete="email"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <SubmitButton>Send Reset Link</SubmitButton>
      </form>
      <AuthFooter>
        Remember your password?{" "}
        <Link href="/login" className="font-semibold text-[#1e3a8a] hover:underline">
          Login
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
