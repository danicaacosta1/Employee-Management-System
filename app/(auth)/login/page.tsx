import { Suspense } from "react";
import { AuthEntryGate } from "@/components/auth/entry-gate";
import LoginContent from "./login-content";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthEntryGate><LoginContent /></AuthEntryGate>
    </Suspense>
  );
}
