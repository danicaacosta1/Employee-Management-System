import "server-only";
import { requireRole } from "@/lib/auth/dal";
import { buildManagerPreviewData } from "./preview-data";

import type { ManagerContext, ManagerData } from "./types";
type DemoLoaded<T> = { pending: false; data: T };
export async function getManagerContext(): Promise<DemoLoaded<ManagerContext>> {
 const user = await requireRole("department_manager");
 const data = buildManagerPreviewData(new Date());
 return { pending: false, data: { ...data.context, name: user.firstName, firstName: user.firstName } };
}
export function shiftDay(day: string, n: number) {
 const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10);
}
export async function loadManagerData(opts: {
 roster?: boolean; tasks?: boolean; leave?: boolean; announcements?: boolean; attendanceFrom?: string;
}): Promise<DemoLoaded<ManagerData>> {
 const user = await requireRole("department_manager");
 const data = buildManagerPreviewData(new Date());
 return { pending: false, data: { ...data,
 context: { ...data.context, name: user.firstName, firstName: user.firstName },
 attendance: opts.attendanceFrom ? data.attendance.filter(r => r.workDate >= opts.attendanceFrom!) : data.attendance,
 } };
}
