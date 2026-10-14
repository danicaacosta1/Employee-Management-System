import { notFound } from "next/navigation";
import { PortalProvider } from "@/components/employee/portal-context";
import { PortalShell } from "@/components/employee/shell";

const PREVIEW = { basePath: "/preview/manager", preview: true };

/**
 * DEVELOPMENT-ONLY visual preview of the manager portal with sample data.
 * Returns 404 in production. Real portal routes (/manager/*) stay guarded.
 */
export default function ManagerPreviewLayout({ children }: LayoutProps<"/preview/manager">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PortalProvider value={PREVIEW}>
      <div className="fixed right-3 bottom-3 z-[60] rounded-md bg-amber-400 px-2.5 py-1 text-[10px] font-bold text-amber-950 shadow">
        DEV PREVIEW · sample data, not saved
      </div>
      <PortalShell variant="manager" name="Marcus Brody" position="Engineering Lead / Dept Manager">
        {children}
      </PortalShell>
    </PortalProvider>
  );
}
