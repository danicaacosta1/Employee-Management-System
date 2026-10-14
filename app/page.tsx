import { redirect } from "next/navigation";
import { Suspense } from "react";
import { redirectAuthenticatedUser } from "@/lib/auth/dal";

async function InitialDestination() {
  await redirectAuthenticatedUser();
  return redirect("/activate");
}

export default function Home() {
  return <Suspense fallback={null}><InitialDestination /></Suspense>;
}
