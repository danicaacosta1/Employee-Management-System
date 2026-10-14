import "server-only";
import { buildFixtures } from "@/lib/preview/fixtures";
import type { ManagerData } from "./types";

/**
 * DEMO sample data for authenticated and preview manager portals, built from the same
 * fixtures as /preview/employee. Never read from or written to the database.
 */
export function buildManagerPreviewData(now: Date): ManagerData {
  const fx = buildFixtures(now);
  return {
    context: fx.context,
    roster: fx.roster,
    tasks: fx.tasks,
    leave: { requests: fx.leave.filter((r) => r.employeeId !== fx.context.employeeId), types: fx.leaveTypes },
    attendance: fx.attendance,
    announcements: fx.deptAnnouncements,
  };
}
