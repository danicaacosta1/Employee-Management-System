import { rangesOverlap, todayKey } from "@/lib/employee/format";
import type { LeaveType } from "@/lib/employee/types";
import type { DeptAttendance, DeptEmployee, DeptLeave, DeptTask } from "./types";

/** Derived manager metrics. Pure functions over loaded rows; nothing estimated. */

export function leaveBalance(requests: DeptLeave[], types: LeaveType[], request: DeptLeave) {
  const entitled = types.find((t) => t.code === request.typeCode)?.annualDays ?? null;
  if (entitled === null) return null;
  const year = request.startDate.slice(0, 4);
  const used = requests
    .filter(
      (r) =>
        r.employeeId === request.employeeId &&
        r.typeCode === request.typeCode &&
        r.status === "approved" &&
        r.startDate.startsWith(year),
    )
    .reduce((sum, r) => sum + r.workingDays, 0);
  const remaining = entitled - used;
  return { entitled, used, remaining, afterApproval: remaining - request.workingDays };
}

/** Teammates on approved/pending leave during the request window. */
export function teamCoverage(request: DeptLeave, roster: DeptEmployee[], requests: DeptLeave[]) {
  const team = roster.filter((p) => p.id !== request.employeeId && p.role === "employee");
  const away = team.filter((p) =>
    requests.some(
      (r) =>
        r.employeeId === p.id &&
        r.id !== request.id &&
        (r.status === "approved" || r.status === "pending") &&
        rangesOverlap(r.startDate, r.endDate, request.startDate, request.endDate),
    ),
  );
  const available = team.length - away.length;
  const ratio = team.length ? available / team.length : 1;
  return {
    total: team.length,
    available,
    away,
    percent: Math.round(ratio * 100),
    level: ratio >= 0.75 ? "Sufficient" : ratio >= 0.5 ? "Limited" : "At Risk",
  } as const;
}

/** The requester's open tasks due inside the leave window. */
export function tasksDueDuring(request: DeptLeave, tasks: DeptTask[]) {
  return tasks.filter(
    (t) =>
      t.assigneeId === request.employeeId &&
      t.status !== "completed" &&
      t.dueDate >= request.startDate &&
      t.dueDate <= request.endDate,
  );
}

export function todaysAttendance(records: DeptAttendance[], today = todayKey()) {
  const rows = records.filter((r) => r.workDate === today);
  const count = (s: DeptAttendance["status"]) => rows.filter((r) => r.status === s).length;
  return { rows, present: count("present"), late: count("late"), absent: count("absent"), onLeave: count("on_leave") };
}

/** Employees on approved leave covering `day`. */
export function onLeaveOn(requests: DeptLeave[], day = todayKey()) {
  return new Set(requests.filter((r) => r.status === "approved" && r.startDate <= day && r.endDate >= day).map((r) => r.employeeId));
}

export function nextTaskCode(tasks: DeptTask[], prefix: string) {
  const numbers = tasks
    .filter((t) => t.code.startsWith(`${prefix}-`))
    .map((t) => Number(t.code.slice(prefix.length + 1)))
    .filter(Number.isFinite);
  return `${prefix}-${Math.max(4100, ...numbers) + 1}`;
}
