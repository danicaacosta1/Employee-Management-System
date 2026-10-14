import "server-only";
import { requireRole } from "@/lib/auth/dal";
import { buildPreviewData } from "./preview-data";
import type { AttendanceRecord, Task, Announcement, LeaveData, Profile, DashboardData } from "./types";
type DemoLoaded<T> = { pending: false; data: T };
async function sample() { await requireRole("employee"); return buildPreviewData(new Date()); }
const loaded = <T,>(data: T): DemoLoaded<T> => ({ pending: false, data });
export async function getAttendance(fromMonth: string): Promise<DemoLoaded<AttendanceRecord[]>> {
  return loaded((await sample()).attendance.filter(r => r.workDate >= `${fromMonth}-01`));
}
export async function getTasks(): Promise<DemoLoaded<Task[]>> { return loaded((await sample()).tasks); }
export async function getAnnouncements(): Promise<DemoLoaded<Announcement[]>> { return loaded((await sample()).announcements); }
export async function getLeaveData(): Promise<DemoLoaded<LeaveData>> { return loaded((await sample()).leave); }
export async function getProfile(): Promise<DemoLoaded<Profile>> { return loaded((await sample()).profile); }
export async function getDashboard(month: string): Promise<DemoLoaded<DashboardData>> {
 const data = await sample();
 return loaded({ ...data.dashboard, attendance: data.attendance.filter(r => r.workDate.startsWith(month)) });
}
export async function getHeaderIdentity() {
 const user = await requireRole("employee"); return { name: user.firstName, position: "Employee" };
}
