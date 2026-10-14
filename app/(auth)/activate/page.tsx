import { Suspense } from "react";
import { AuthEntryGate } from "@/components/auth/entry-gate";
import ActivateForm from "./activate-form";

export default function ActivatePage() {
  return (
    <Suspense fallback={null}>
      <AuthEntryGate><ActivateForm /></AuthEntryGate>
    </Suspense>
  );
}
