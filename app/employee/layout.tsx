import { Suspense } from "react";
import { getHeaderIdentity } from "@/lib/employee/queries";
import { PortalProvider } from "@/components/employee/portal-context";
import { EmployeeShell, ShellFallback } from "@/components/employee/shell";
import { LoadingState } from "@/components/employee/ui";

const PORTAL = { basePath: "/employee", preview: false };

/** Verifies session + employee role (DAL) before rendering any portal content. */
async function EmployeeArea({ children }: { children: React.ReactNode }) {
  const identity = await getHeaderIdentity();
  return (
    <EmployeeShell name={identity.name} position={identity.position}>
      {children}
    </EmployeeShell>
  );
}

export default function EmployeeLayout({ children }: LayoutProps<"/employee">) {
  return (
    <PortalProvider value={PORTAL}>
      <Suspense
        fallback={
          <ShellFallback variant="employee">
            <LoadingState />
          </ShellFallback>
        }
      >
        <EmployeeArea>{children}</EmployeeArea>
      </Suspense>
    </PortalProvider>
  );
}
