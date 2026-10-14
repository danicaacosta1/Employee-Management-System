"use client";

import Link from "next/link";
import { useActionState } from "react";
import { activateAccount, type FormState } from "@/lib/auth/actions";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";
import { SubmitButton, TextField } from "@/components/auth/fields";
import { IdCardIcon, MailIcon } from "@/components/ui/icons";

export default function ActivateForm() {
  const [state, action] = useActionState<FormState, FormData>(activateAccount, {});

  return (
    <AuthCard
      title="Activate Account"
      subtitle="Enter your credentials to activate your corporate profile"
    >
      {state.error && <AuthAlert message={state.error} />}
      {state.success && (
        <AuthAlert tone="success" title="Check your inbox" message={state.success} />
      )}
      <form action={action} noValidate>
        <TextField
          label="Employee ID"
          name="employeeId"
          icon={IdCardIcon}
          placeholder="e.g. EMP-2025-4102"
          autoComplete="off"
          defaultValue={state.values?.employeeId}
          error={state.fieldErrors?.employeeId}
        />
        <TextField
          label="Company Email"
          name="email"
          type="email"
          icon={MailIcon}
          placeholder="name@luminasystems.com"
          autoComplete="email"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          aside={
            <span className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              Work Email
            </span>
          }
        />
        <SubmitButton>Activate Account</SubmitButton>
      </form>
      <AuthFooter>
        Already activated?{" "}
        <Link href="/login" className="font-semibold text-[#1e3a8a] hover:underline">
          Login
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
