import "server-only";
import { PREVIEW_EMPLOYEE_ID, buildFixtures, toEmployeeAttendance } from "@/lib/preview/fixtures";
import type { LeaveData, Profile, Task } from "./types";

/**
 * DEMO sample data for /preview/employee: the preview employee's
 * slice of the shared department fixtures (lib/preview/fixtures.ts).
 * Never read from or written to the database. Authenticated portals use these samples too.
 */
export function buildPreviewData(now: Date) {
  const fx = buildFixtures(now);
  const me = fx.roster.find((p) => p.id === PREVIEW_EMPLOYEE_ID)!;
  const manager = fx.roster.find((p) => p.id === fx.context.employeeId)!;

  const tasks: Task[] = fx.tasks.filter((t) => t.assigneeId === me.id);

  const announcements = [
    ...fx.companyAnnouncements,
    ...fx.deptAnnouncements.filter((a) => a.status === "published"),
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const leave: LeaveData = {
    types: fx.leaveTypes,
    approver: { name: manager.name, position: manager.position },
    requests: fx.leave.filter((r) => r.employeeId === me.id),
  };

  const [firstName, ...rest] = me.name.split(" ");
  const profile: Profile = {
    employeeCode: me.code,
    firstName,
    lastName: rest.join(" "),
    email: me.email,
    phone: me.phone,
    position: me.position,
    jobLevel: me.jobLevel,
    department: fx.context.departmentName,
    officeLocation: "HQ Building B - Floor 4, Desk 412",
    hireDate: me.hireDate,
    employmentType: me.employmentType,
    employmentStatus: me.employmentStatus,
    avatarUrl: null,
  };

  const attendance = fx.attendance.filter((r) => r.employeeId === me.id).map(toEmployeeAttendance);
  const month = attendance[0]?.workDate.slice(0, 7);

  return {
    identity: { name: me.name, firstName, position: me.position },
    attendance,
    tasks,
    announcements,
    leave,
    profile,
    dashboard: {
      attendance: attendance.filter((r) => r.workDate.slice(0, 7) === month),
      tasks,
      announcements: announcements.slice(0, 3),
      leaveRequests: leave.requests,
      pendingLeaves: leave.requests.filter((r) => r.status === "pending").length,
    },
  };
}
