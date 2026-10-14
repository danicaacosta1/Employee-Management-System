"use client";

import { createContext, use, type ReactNode } from "react";

type PortalContextValue = {
  /** Route prefix: "/employee", or the dev-only preview prefix. */
  basePath: string;
  /** Dev preview routing. Authentication and logout are disabled only for these routes. */
  preview: boolean;
};

const PortalContext = createContext<PortalContextValue>({ basePath: "/employee", preview: false });

export function PortalProvider({ value, children }: { value: PortalContextValue; children: ReactNode }) {
  return <PortalContext value={value}>{children}</PortalContext>;
}

export function usePortal() {
  return use(PortalContext);
}

