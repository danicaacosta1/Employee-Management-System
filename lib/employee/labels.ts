import type {
  AnnouncementCategory,
  AttendanceStatus,
  LeaveStatus,
  TaskPriority,
  TaskStatus,
} from "./types";

type Tone = "green" | "red" | "blue" | "amber" | "gray" | "indigo";
type Label = { label: string; tone: Tone };

export const ATTENDANCE_STATUS: Record<AttendanceStatus, Label> = {
  present: { label: "Present", tone: "green" },
  late: { label: "Late", tone: "blue" },
  absent: { label: "Absent", tone: "red" },
  on_leave: { label: "On Leave", tone: "amber" },
  holiday: { label: "Holiday", tone: "indigo" },
  weekend: { label: "Weekend", tone: "gray" },
};

export const TASK_STATUS: Record<TaskStatus, Label> = {
  todo: { label: "To Do", tone: "red" },
  in_progress: { label: "In Progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
};

export const TASK_PRIORITY: Record<TaskPriority, Label> = {
  high: { label: "High", tone: "red" },
  medium: { label: "Medium", tone: "blue" },
  low: { label: "Low", tone: "gray" },
};

export const LEAVE_STATUS: Record<LeaveStatus, Label> = {
  pending: { label: "Pending", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

export const ANNOUNCEMENT_CATEGORY: Record<AnnouncementCategory, string> = {
  hr_benefits: "HR & Benefits",
  it_security: "IT & Security",
  company_news: "Company News",
  facilities: "Facilities",
  sprint_notices: "Sprint Notices",
  technical_guidelines: "Technical Guidelines",
  team_events: "Team Events",
  operational: "Operational",
};

/** Category chips shown by default on each portal (others appear when present in data). */
export const EMPLOYEE_CATEGORIES: AnnouncementCategory[] = ["hr_benefits", "it_security", "company_news", "facilities"];
export const MANAGER_CATEGORIES: AnnouncementCategory[] = [
  "sprint_notices",
  "technical_guidelines",
  "team_events",
  "operational",
];

export const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  probationary: "Probationary",
};
