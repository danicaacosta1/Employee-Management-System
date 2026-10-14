"use client";

import { useState, type ReactNode } from "react";
import { PortalHeader } from "./header";
import { EMPLOYEE_NAV, MANAGER_NAV, PortalSidebar } from "./sidebar";

type Variant = "employee" | "manager";

const SIDEBAR: Record<Variant, { nav: typeof EMPLOYEE_NAV; heading?: string }> = {
  employee: { nav: EMPLOYEE_NAV },
  manager: { nav: MANAGER_NAV, heading: "Workspace" },
};

/** Sidebar (fixed on desktop, drawer on mobile) + header + scrolling content. */
export function PortalShell({
  variant,
  name,
  position,
  children,
}: {
  variant: Variant;
  name: string;
  position: string | null;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = SIDEBAR[variant];

  return (
    <div className="flex min-h-dvh flex-1 bg-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <PortalSidebar {...sidebar} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <PortalSidebar {...sidebar} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <PortalHeader variant={variant} name={name} position={position} onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-7"><p role="status" className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[10.5px] text-slate-600">Demo HR data. Changes stay in this tab until reload; no records or files are saved.</p>{children}</main>
      </div>
    </div>
  );
}

export function EmployeeShell(props: { name: string; position: string | null; children: ReactNode }) {
  return <PortalShell variant="employee" {...props} />;
}

/** Static shell shown while the session/role check streams in. */
export function ShellFallback({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <PortalSidebar {...SIDEBAR[variant]} />
      </aside>
      <div className="flex-1 lg:pl-64">
        <div className="h-[52px] border-b border-slate-200" />
        {children}
      </div>
    </div>
  );
}
