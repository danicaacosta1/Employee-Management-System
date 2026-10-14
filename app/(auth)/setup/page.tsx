import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/roles";
import { SetupForm } from "./setup-form";

/** Redirects away unless the signed-in user still needs first-time setup. */
async function SetupGate() {
  const user = await requireUser();
  if (user.setupComplete) redirect(roleHome(user.role));
  return <SetupForm />;
}

export default function SetupPage() {
  // completeSetup re-checks the session, so the static fallback form is safe.
  return (
    <Suspense fallback={<SetupForm />}>
      <SetupGate />
    </Suspense>
  );
}
