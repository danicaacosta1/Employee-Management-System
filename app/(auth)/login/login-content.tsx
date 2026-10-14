"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "./login-form";

function LoginFormWithParams() {
  const params = useSearchParams();
  return (
    <LoginForm
      next={params.get("next") ?? undefined}
      notice={params.get("notice") ?? undefined}
    />
  );
}

export default function LoginContent() {
  // The fallback is the same form without query params, so the static shell is usable at once.
  return (
    <Suspense fallback={<LoginForm />}>
      <LoginFormWithParams />
    </Suspense>
  );
}
