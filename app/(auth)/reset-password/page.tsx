"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordField, SubmitButton } from "@/components/auth/fields";
import { LockIcon, ShieldCheckIcon } from "@/components/ui/icons";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});

  return (
    <AuthCard
      title="Reset Password"
      subtitle="Choose a new password for your account"
      icon={<ShieldCheckIcon className="size-5" />}
    >
      {state.error && <AuthAlert message={state.error} />}
      <form action={action} noValidate>
        <PasswordField
          label="New Password"
          name="password"
          icon={LockIcon}
          placeholder={`Create a password (min. ${PASSWORD_MIN} characters)`}
          autoComplete="new-password"
          error={state.fieldErrors?.password}
        />
        <PasswordField
          label="Confirm Password"
          name="confirm"
          icon={ShieldCheckIcon}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirm}
        />
        <SubmitButton>Save Changes</SubmitButton>
      </form>
    </AuthCard>
  );
}
