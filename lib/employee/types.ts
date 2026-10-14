export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "on_leave"
  | "holiday"
  | "weekend";

export type AttendanceRecord = {
  id: string;
  workDate: string; // YYYY-MM-DD
  timeIn: string | null; // ISO timestamp
  timeOut: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus;
  shiftLabel: string | null;
  notes: string | null;
};

export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export type Person = { name: string; position: string | null };

export type Task = {
  id: string;
  code: string;
  project: string | null;
  title: string;
  description: string | null;
  assignedBy: Person | null;
  assignedAt: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  latestRemark: string | null;
};

export type AnnouncementCategory =
  | "hr_benefits"
  | "it_security"
  | "company_news"
  | "facilities"
  | "sprint_notices"
  | "technical_guidelines"
  | "team_events"
  | "operational";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  tag: string | null;
  issuedBy: string | null;
  publishedAt: string;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveType = {
  id: string;
  code: string;
  name: string;
  annualDays: number | null;
  requiresDocument: boolean;
};

export type LeaveRequest = {
  id: string;
  code: string;
  typeCode: string;
  typeName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  decidedAt: string | null;
  managerRemarks: string | null;
  attachmentName: string | null;
};

export type LeaveData = {
  requests: LeaveRequest[];
  types: LeaveType[];
  approver: Person | null;
};

export type Profile = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  jobLevel: string | null;
  department: string | null;
  officeLocation: string | null;
  hireDate: string | null;
  employmentType: string;
  employmentStatus: string;
  avatarUrl: string | null;
};

export type DashboardData = {
  attendance: AttendanceRecord[];
  tasks: Task[];
  announcements: Announcement[];
  pendingLeaves: number;
  leaveRequests?: LeaveRequest[];
};

/** Data that may be unavailable because the portal schema is not migrated yet. */
export type Loaded<T> = { pending: false; data: T } | { pending: true; data: null };
