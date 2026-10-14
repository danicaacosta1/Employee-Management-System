import type {
  Announcement,
  AttendanceRecord,
  LeaveRequest,
  LeaveType,
  Task,
} from "@/lib/employee/types";

/** Manager portal view models. Same tables/contract as the employee portal. */

export type ManagerContext = {
  employeeId: string;
  name: string;
  firstName: string;
  position: string | null;
  departmentName: string;
  departmentCode: string;
};

export type DeptEmployee = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  jobLevel: string | null;
  role: "department_manager" | "employee";
  employmentType: string;
  employmentStatus: string;
  hireDate: string | null;
};

export type DeptTask = Task & { assigneeId: string; assigneeName: string };

export type DeptLeave = LeaveRequest & {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeePosition: string | null;
};

export type DeptAttendance = AttendanceRecord & {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
};

export type AnnouncementStatus = "draft" | "published" | "archived";

export type DeptAnnouncement = Announcement & {
  status: AnnouncementStatus;
  attachmentName: string | null;
  updatedAt: string;
};

export type DeptLeaveData = { requests: DeptLeave[]; types: LeaveType[] };

/** Everything a manager page may need; each page loads only what it renders. */
export type ManagerData = {
  context: ManagerContext;
  roster: DeptEmployee[];
  tasks: DeptTask[];
  leave: DeptLeaveData;
  attendance: DeptAttendance[];
  announcements: DeptAnnouncement[];
};
