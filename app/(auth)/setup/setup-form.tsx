"use client";

import { useActionState } from "react";
import { completeSetup, type FormState } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { LockIcon, ShieldCheckIcon, UserIcon } from "@/components/ui/icons";

export function SetupForm() {
  const [state, action] = useActionState<FormState, FormData>(completeSetup, {});

  return (
    <AuthCard
      title="Update Credentials"
      subtitle="Replace your temporary username and password with your own"
      icon={<ShieldCheckIcon className="size-5" />}
    >
      {state.error && <AuthAlert message={state.error} />}
      <form action={action} noValidate>
        <TextField
          label="New Username"
          name="username"
          icon={UserIcon}
          placeholder="Choose your corporate username"
          autoComplete="username"
          defaultValue={state.values?.username}
          error={state.fieldErrors?.username}
        />
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
