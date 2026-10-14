import "server-only";
import { toDayKey } from "@/lib/employee/format";
import type { Announcement, AttendanceRecord, LeaveType } from "@/lib/employee/types";
import type {
  DeptAnnouncement,
  DeptAttendance,
  DeptEmployee,
  DeptLeave,
  DeptTask,
  ManagerContext,
} from "@/lib/manager/types";

/**
 * DEVELOPMENT-ONLY SAMPLE DATA shared by the /preview/employee and
 * /preview/manager routes so both portals show one consistent department.
 * Not real records; never read from or written to the database.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** Manila wall-clock time as an ISO instant. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`).toISOString();

export const PREVIEW_EMPLOYEE_ID = "e-elena";

const person = (
  id: string,
  code: string,
  name: string,
  position: string,
  extra: Partial<DeptEmployee> = {},
): DeptEmployee => ({
  id,
  code,
  name,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@enterprise-ems.com`,
  phone: null,
  position,
  jobLevel: null,
  role: "employee",
  employmentType: "full_time",
  employmentStatus: "active",
  hireDate: null,
  ...extra,
});

const ROSTER: DeptEmployee[] = [
  person("m-marcus", "EMP-2019-0012", "Marcus Brody", "Engineering Lead", { role: "department_manager", phone: "+1 (555) 210-4410" }),
  person("e-elena", "EMP-2022-8491", "Elena Vance", "Software Engineer II", { jobLevel: "Class IC-3", phone: "+1 (555) 382-9104", hireDate: "2022-03-15" }),
  person("e-julian", "EMP-2021-3102", "Julian Rivera", "Senior Backend Engineer", { phone: "+1 (555) 491-0028" }),
  person("e-maya", "EMP-2023-1184", "Maya Lin", "UI/UX Designer", { phone: "+1 (555) 209-7741", employmentStatus: "on_leave" }),
  person("e-tariq", "EMP-2020-5590", "Tariq Al-Mansoor", "DevOps Specialist", { phone: "+1 (555) 714-3329" }),
  person("e-chloe", "EMP-2022-9023", "Chloe Zhang", "QA Automation Lead", { phone: "+1 (555) 602-8812" }),
  person("e-lucas", "EMP-2024-0419", "Lucas Moreau", "Junior Fullstack Engineer", { phone: "+1 (555) 918-4450", employmentType: "probationary" }),
  person("e-david", "EMP-2021-2041", "David Chen", "Senior Backend Dev", { phone: "+1 (555) 330-1290" }),
  person("e-sophia", "EMP-2023-1102", "Sophia Patel", "Product Designer", { phone: "+1 (555) 841-2203" }),
  person("e-liam", "EMP-2020-1049", "Liam O'Connor", "Senior DevOps Engineer", { phone: "+1 (555) 562-0937" }),
  person("e-alex", "EMP-2019-2015", "Alex Mercer", "Security Engineer", { phone: "+1 (555) 117-6604" }),
  person("e-carlos", "EMP-2022-1290", "Carlos Ruiz", "Data Engineer", { phone: "+1 (555) 726-3318" }),
];

const LEAVE_TYPES: LeaveType[] = [
  { id: "lt1", code: "vacation", name: "Annual Leave", annualDays: 15, requiresDocument: false },
  { id: "lt2", code: "sick", name: "Sick Leave", annualDays: 10, requiresDocument: false },
  { id: "lt3", code: "personal", name: "Personal Leave", annualDays: 3, requiresDocument: false },
  { id: "lt4", code: "emergency", name: "Emergency Leave", annualDays: 3, requiresDocument: false },
];

const byId = (id: string) => ROSTER.find((p) => p.id === id)!;

function attendance(today: Date): DeptAttendance[] {
  const rows: DeptAttendance[] = [];
  ROSTER.forEach((p, pi) => {
    const daysBack = p.id === PREVIEW_EMPLOYEE_ID ? 26 : 10;
    for (let i = 0; i < daysBack; i++) {
      const d = addDays(today, -i);
      const date = day(d);
      const dow = d.getUTCDay();
      const base = { employeeId: p.id, employeeName: p.name, employeeCode: p.code, workDate: date, id: `a-${p.id}-${i}` };
      if (dow === 0 || dow === 6) {
        rows.push({ ...base, timeIn: null, timeOut: null, workedMinutes: null, status: "weekend", shiftLabel: null, notes: "Weekly Rest Day" });
        continue;
      }
      if (p.id === "e-maya" && i < 3) {
        rows.push({ ...base, timeIn: null, timeOut: null, workedMinutes: null, status: "on_leave", shiftLabel: "Standard Core Shift", notes: "Approved leave" });
        continue;
      }
      if (p.id === "e-sophia" && i === 0) {
        rows.push({ ...base, timeIn: null, timeOut: null, workedMinutes: null, status: "absent", shiftLabel: "Standard Core Shift", notes: "No check-in recorded" });
        continue;
      }
      const late = (i === 0 && (p.id === "e-elena" || p.id === "e-david")) || (i === 8 && p.id === "e-elena");
      const m = (pi * 7 + i * 3) % 15;
      const inTime = late ? (p.id === "e-david" ? "09:22" : "09:14") : `08:${pad(45 + m)}`;
      const timeIn = at(date, inTime);
      // Today: most people are still on shift (no time out yet).
      const onShift = i === 0 && pi % 3 !== 1;
      const timeOut = onShift ? null : at(date, `18:${pad((m * 4) % 60)}`);
      rows.push({
        ...base,
        timeIn,
        timeOut,
        workedMinutes: timeOut ? Math.round((Date.parse(timeOut) - Date.parse(timeIn)) / 60_000) : null,
        status: late ? "late" : "present",
        shiftLabel: "Standard Core Shift",
        notes: late ? (p.id === "e-david" ? "Arrived 22 mins late" : "Transit delay reported") : null,
      });
    }
  });
  return rows;
}

function tasks(today: Date): DeptTask[] {
  const marcus = { name: "Marcus Brody", position: "Engineering Lead" };
  const t = (n: number) => day(addDays(today, n));
  const mk = (
    id: string,
    code: string,
    project: string | null,
    title: string,
    description: string,
    assignee: string,
    due: number,
    priority: DeptTask["priority"],
    status: DeptTask["status"],
    latestRemark: string | null = null,
  ): DeptTask => ({
    id,
    code,
    project,
    title,
    description,
    assignedBy: marcus,
    assignedAt: addDays(today, -6).toISOString(),
    dueDate: t(due),
    priority,
    status,
    latestRemark,
    assigneeId: assignee,
    assigneeName: byId(assignee).name,
  });
  return [
    mk("t1", "ENG-4109", "Auth Service", "Implement OAuth2 Token Refresh", "Configure background refresh tokens and handle expiration gracefully in the React client. Ensure session timeout warnings display 2 minutes prior. All authentication state must sync smoothly with persistent local encrypted storage.", "e-elena", 2, "high", "in_progress", "Implemented Axios interceptors. Testing token rotation in staging."),
    mk("t2", "DOC-102", "API Platform", "Update API Documentation for V2", "Sync endpoint schemas and request params with Swagger specifications.", "e-elena", 5, "medium", "todo"),
    mk("t3", "SEC-882", "Compliance", "Review Q3 Security Audit Findings", "Patch dependencies flagged in SonarQube report and verify SBOM manifests.", "e-elena", 9, "high", "todo"),
    mk("t4", "ENG-4071", "Internal Messaging Event Bus", "Refactor Notification Dispatcher", "Split the dispatcher into channel adapters and add retry with backoff.", "e-elena", -2, "low", "completed"),
    mk("t5", "DOC-103", "API Platform", "Publish SDK Changelog", "Draft and publish the V2 SDK changelog for partner developers.", "e-david", 5, "medium", "todo"),
    mk("t6", "SEC-884", "Compliance", "Rotate Service Account Credentials", "Rotate CI service account keys and update the secrets vault references.", "e-alex", 3, "high", "in_progress"),
    mk("t7", "ENG-4091", "Accounts", "Migrate User Profile Endpoints", "Move profile endpoints to the new accounts service.", "e-sophia", -1, "medium", "completed"),
    mk("t8", "INF-204", "Platform", "Setup Redis Cache Cluster", "Provision a 3-node Redis cluster for session caching.", "e-alex", 12, "low", "todo"),
    mk("t9", "ENG-4112", "Platform", "Harden Kubernetes Ingress Rules", "Restrict ingress to approved CIDR ranges and add WAF rules.", "e-tariq", 4, "high", "in_progress"),
    mk("t10", "QA-310", "Quality", "Automate Checkout Regression Suite", "Cover the checkout flow with Playwright regression tests.", "e-chloe", 7, "medium", "in_progress"),
    mk("t11", "ENG-4114", "Data", "Backfill Attendance Analytics Table", "Backfill 12 months of attendance aggregates for reporting.", "e-carlos", 10, "medium", "todo"),
    mk("t12", "ENG-4098", "Growth", "Onboarding Checklist UI", "Build the onboarding checklist widget for new hires.", "e-lucas", -4, "low", "completed"),
  ];
}

function leave(today: Date): DeptLeave[] {
  const d = (n: number) => day(addDays(today, n));
  const iso = (n: number, hhmm = "11:30") => at(d(n), hhmm);
  const mk = (
    id: string,
    code: string,
    who: string,
    typeCode: string,
    typeName: string,
    start: number,
    end: number,
    workingDays: number,
    reason: string,
    status: DeptLeave["status"],
    submitted: number,
    extra: Partial<DeptLeave> = {},
  ): DeptLeave => ({
    id,
    code,
    typeCode,
    typeName,
    startDate: d(start),
    endDate: d(end),
    workingDays,
    reason,
    status,
    submittedAt: iso(submitted),
    decidedAt: status === "pending" ? null : iso(submitted + 1, "09:00"),
    managerRemarks: null,
    attachmentName: null,
    employeeId: who,
    employeeName: byId(who).name,
    employeeCode: byId(who).code,
    employeePosition: byId(who).position,
    ...extra,
  });
  return [
    mk("l1", "REQ-84920", "e-elena", "vacation", "Annual Leave", 21, 22, 2, "Family commitment out of state. Marcus has approved project handoff to team. Deployment scripts and QA reviews are delegated to Sophia Patel.", "pending", 0),
    mk("l5", "REQ-85002", "e-david", "sick", "Sick Leave", 8, 8, 1, "Scheduled medical procedure; certificate attached.", "pending", -1, { attachmentName: "medical-certificate.pdf" }),
    mk("l6", "REQ-85013", "e-sophia", "emergency", "Emergency Leave", 11, 13, 3, "Family emergency requiring travel home.", "pending", -2),
    mk("l7", "REQ-85021", "e-liam", "personal", "Personal Leave", 26, 30, 5, "KubeCon North America conference attendance.", "pending", -4),
    mk("l8", "REQ-84877", "e-maya", "vacation", "Annual Leave", -2, 2, 3, "Pre-planned family vacation.", "approved", -9),
    mk("l9", "REQ-84790", "e-julian", "personal", "Personal Leave", -6, -6, 1, "Moving to a new apartment.", "rejected", -12, { managerRemarks: "Conflicts with core deployment freeze. Please pick another date." }),
    mk("l2", "REQ-81204", "e-elena", "sick", "Sick Leave", -50, -49, 2, "Flu with fever; medical certificate attached.", "approved", -50, { attachmentName: "medical-certificate.pdf", managerRemarks: "Get well soon." }),
    mk("l3", "REQ-76901", "e-elena", "personal", "Personal Leave", -98, -98, 1, "Personal errand requiring government office visit.", "approved", -106),
    mk("l4", "REQ-68192", "e-elena", "emergency", "Emergency Leave", -218, -218, 1, "Urgent family emergency at home.", "approved", -218),
  ];
}

function announcements(today: Date): DeptAnnouncement[] {
  const iso = (n: number, hhmm: string) => at(day(addDays(today, -n)), hhmm);
  const mk = (a: Omit<DeptAnnouncement, "updatedAt">): DeptAnnouncement => ({ ...a, updatedAt: a.publishedAt });
  const by = "Marcus Brody (Engineering Lead)";
  return [
    mk({ id: "d1", category: "sprint_notices", tag: null, issuedBy: by, status: "published", publishedAt: iso(1, "15:30"), attachmentName: "schedule.pdf", title: "Q4 Sprint 3 Code Freeze & Production Deployment Schedule", body: "Please ensure all pull requests targeted for the v2.4 milestone are merged into the release branch by Thursday 5:00 PM. Automated regression test suites will run overnight." }),
    mk({ id: "d2", category: "technical_guidelines", tag: null, issuedBy: by, status: "published", publishedAt: iso(4, "11:00"), attachmentName: null, title: "Engineering Architecture Guild: Microservices Event Bus Deep Dive", body: "Join us in Conference Room 4B or via Google Meet this Friday at 2:00 PM for a walkthrough of our new Kafka-based event schema." }),
    mk({ id: "d3", category: "team_events", tag: null, issuedBy: by, status: "published", publishedAt: iso(8, "09:15"), attachmentName: null, title: "Welcome Liam O'Connor & Onboarding Buddy Assignments", body: "Please give a warm welcome to Liam O'Connor joining us as Senior DevOps Engineer. Sophia Patel will act as onboarding mentor." }),
    mk({ id: "d4", category: "operational", tag: null, issuedBy: by, status: "draft", publishedAt: iso(0, "08:40"), attachmentName: null, title: "Scheduled Staging Environment Maintenance", body: "Staging clusters will undergo routine Redis node replacement on Monday between 02:00 AM and 04:00 AM. Please reschedule staging load tests accordingly." }),
  ];
}

/** Company-wide bulletins (no department) seen by every employee. */
function companyAnnouncements(today: Date): Announcement[] {
  const iso = (n: number, hhmm: string) => at(day(addDays(today, -n)), hhmm);
  return [
    { id: "n1", category: "hr_benefits", tag: "Action Required", issuedBy: "Issued by People Operations Team", publishedAt: iso(2, "10:15"), title: "Annual Health Checkup Enrollment Open", body: "The annual preventive health evaluation program is officially open for all permanent and probationary employees. Partnered medical clinics across the metro district will provide complimentary executive screening profiles, vision examinations, and core blood panels.\n\nThe booking window runs strictly through the end of next month. Under updated medical plan guidelines, all appointments scheduled within corporate wellness hours are designated as excused operational leave. Dependent coverage addition forms must be verified prior to appointment date confirmation." },
    { id: "n2", category: "it_security", tag: "Maintenance", issuedBy: "Infrastructure & SecOps", publishedAt: iso(5, "16:30"), title: "Critical Office Network Maintenance & Scheduled Downtime", body: "Core router firmware updates will take place on Saturday from 02:00 AM to 05:00 AM. VPN and internal services will be temporarily unavailable." },
    { id: "n3", category: "company_news", tag: null, issuedBy: "Executive Operations", publishedAt: iso(6, "14:00"), title: "Q4 All-Hands Town Hall & Product Roadmap Showcase", body: "Join the CEO and department leads for the quarterly town hall in the 4th-floor auditorium or via livestream on Google Meet for key quarterly milestones." },
    { id: "n4", category: "hr_benefits", tag: null, issuedBy: "People & Culture Team", publishedAt: iso(14, "09:00"), title: "Updated Remote Work & Hybrid Schedule Guidelines", body: "Effective next month, employees may coordinate with team leads on flexible in-office core hours between 10:00 AM and 3:00 PM." },
    { id: "n5", category: "facilities", tag: null, issuedBy: "Workplace Experience", publishedAt: iso(20, "11:45"), title: "Facilities Notice: Bike Storage Room Access Card Update", body: "Bicycle locker access cards are being migrated to the unified RFID standard. Please visit the ground floor security desk to re-encode your badge." },
  ];
}

export function buildFixtures(now: Date) {
  // Company calendar day (Asia/Manila), matching todayKey() used by the views.
  const today = new Date(`${toDayKey(now)}T00:00:00Z`);
  const context: ManagerContext = {
    employeeId: "m-marcus",
    name: "Marcus Brody",
    firstName: "Marcus",
    position: "Engineering Lead",
    departmentName: "Engineering & Product",
    departmentCode: "ENG",
  };
  return {
    context,
    roster: ROSTER,
    leaveTypes: LEAVE_TYPES,
    attendance: attendance(today),
    tasks: tasks(today),
    leave: leave(today),
    deptAnnouncements: announcements(today),
    companyAnnouncements: companyAnnouncements(today),
  };
}

/** Strip department context from an attendance row for the employee view. */
export function toEmployeeAttendance(row: DeptAttendance): AttendanceRecord {
  const { id, workDate, timeIn, timeOut, workedMinutes, status, shiftLabel, notes } = row;
  return { id, workDate, timeIn, timeOut, workedMinutes, status, shiftLabel, notes };
}
