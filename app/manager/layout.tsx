import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { getManagerContext } from "@/lib/manager/queries";
import { PortalProvider } from "@/components/employee/portal-context";
import { PortalShell, ShellFallback } from "@/components/employee/shell";
import { LoadingState } from "@/components/employee/ui";

const PORTAL = { basePath: "/manager", preview: false };

/** Verifies session + department_manager role (DAL) before rendering any portal content. */
async function ManagerArea({ children }: { children: React.ReactNode }) {
  const user = await requireRole("department_manager");
  const ctx = await getManagerContext();
  const name = ctx.pending ? user.firstName : ctx.data.name;
  const position = ctx.pending ? "Dept Manager" : [ctx.data.position, "Dept Manager"].filter(Boolean).join(" / ");
  return (
    <PortalShell variant="manager" name={name} position={position}>
      {children}
    </PortalShell>
  );
}

export default function ManagerLayout({ children }: LayoutProps<"/manager">) {
  return (
    <PortalProvider value={PORTAL}>
      <Suspense
        fallback={
          <ShellFallback variant="manager">
            <LoadingState />
          </ShellFallback>
        }
      >
        <ManagerArea>{children}</ManagerArea>
      </Suspense>
    </PortalProvider>
  );
}
