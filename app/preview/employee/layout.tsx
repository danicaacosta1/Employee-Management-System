import { notFound } from "next/navigation";
import { PortalProvider } from "@/components/employee/portal-context";
import { EmployeeShell } from "@/components/employee/shell";

const PREVIEW = { basePath: "/preview/employee", preview: true };

/**
 * DEVELOPMENT-ONLY visual preview of the employee portal with sample data.
 * Returns 404 in production. Real portal routes (/employee/*) stay guarded.
 */
export default function EmployeePreviewLayout({ children }: LayoutProps<"/preview/employee">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PortalProvider value={PREVIEW}>
      <div className="fixed right-3 bottom-3 z-[60] rounded-md bg-amber-400 px-2.5 py-1 text-[10px] font-bold text-amber-950 shadow">
        DEV PREVIEW · sample data, not saved
      </div>
      <EmployeeShell name="Elena Vance" position="Software Engineer II">
        {children}
      </EmployeeShell>
    </PortalProvider>
  );
}
