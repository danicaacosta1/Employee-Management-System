import type { ReactNode } from "react";
import { redirectAuthenticatedUser } from "@/lib/auth/dal";

/** Reads the database-backed session inside the page's Suspense boundary. */
export async function AuthEntryGate({ children }: { children: ReactNode }) {
  await redirectAuthenticatedUser();
  return children;
}
