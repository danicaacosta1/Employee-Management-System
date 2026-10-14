"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ManagerData } from "@/lib/manager/types";
import { decideLeave } from "@/lib/manager/actions";
import { onLeaveOn, todaysAttendance } from "@/lib/manager/insights";
import { daysUntil, formatDay, todayKey } from "@/lib/employee/format";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  MegaphoneIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { Card, EmptyState, FormMessage, InitialsAvatar, StatusBadge, buttonClass, cx, type IconType } from "@/components/employee/ui";
import { usePortal } from "@/components/employee/portal-context";
import { TaskModal } from "../task-modal";
import { AnnouncementModal } from "../announcement-modal";
import { LeaveReviewPanel } from "../leave-panel";

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tile,
}: {
  label: string;
  value: number;
  note: React.ReactNode;
  icon: IconType;
  tile: string;
}) {
  return (
    <Card className="border-slate-300 px-3.5 pt-3 pb-3.5">
      <div className="flex items-start justify-between">
        <p className="text-[10px] text-slate-500">{label}</p>
        <span className={cx("flex size-6 items-center justify-center rounded-md", tile)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-3 text-[20px] leading-6 font-bold text-slate-900">{value}</p>
      <p className="mt-1.5 text-[9.5px] text-slate-500">{note}</p>
    </Card>
  );
}

export function ManagerDashboardView({ data: initialData }: { data: ManagerData }) {
  const data = useDemoManager(initialData);
  const { basePath } = usePortal();
  const router = useRouter();
  const [modal, setModal] = useState<"task" | "announcement" | null>(null);
  const [review, setReview] = useState<{ id: string; reject: boolean } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const today = todayKey();
  const { context, roster, tasks, leave, attendance } = data;
  const away = onLeaveOn(leave.requests, today);
  const activeCount = roster.filter((p) => p.employmentStatus === "active" && !away.has(p.id)).length;
  const att = todaysAttendance(attendance, today);
  const pending = leave.requests.filter((r) => r.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const dueThisWeek = tasks.filter((t) => t.status !== "completed" && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length;
  const recent = pending.slice(0, 4);
  const reviewing = review ? leave.requests.find((r) => r.id === review.id) : undefined;

  function approve(id: string) {
    setApproving(id);
    startTransition(async () => {
      const res = await decideLeave(id, "approved", "");
      setApproving(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] leading-7 font-semibold text-slate-900">Welcome back, {context.name}</h1>
          <span className="mt-1 inline-block rounded bg-blue-50 px-2 py-0.5 text-[9.5px] font-medium text-[#2563eb]">
            {context.departmentName} Department • {roster.length} Team Members
          </span>
          <p className="mt-1.5 max-w-[340px] text-[11.5px] leading-[17px] text-slate-500">
            Overview of department headcount, daily attendance, active sprint tasks, and pending approvals for today,{" "}
            {formatDay(today, { month: "long", day: "numeric", year: "numeric" })}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModal("task")} className={cx(buttonClass("secondary"), "border-transparent bg-slate-50")}>
            <ClipboardListIcon className="size-3.5" /> Assign Task
          </button>
          <button type="button" onClick={() => setModal("announcement")} className={cx(buttonClass("secondary"), "border-transparent bg-slate-50")}>
            <MegaphoneIcon className="size-3.5" /> Post Announcement
          </button>
          <Link href={`${basePath}/leave`} className={buttonClass("primary")}>
            <CheckCircleIcon className="size-3.5" /> Review Leaves
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={roster.length}
          icon={UsersIcon}
          tile="bg-blue-50 text-[#2563eb]"
          note={`● ${activeCount} Active • ${away.size} On Leave`}
        />
        <StatCard
          label="Attendance Issues Today"
          value={att.late + att.absent}
          icon={ClockIcon}
          tile="bg-red-50 text-red-500"
          note={`${att.late} Late • ${att.absent} Absent • ${att.present} Present on-time`}
        />
        <StatCard
          label="Pending Leave Requests"
          value={pending.length}
          icon={CalendarCheckIcon}
          tile="bg-blue-50 text-[#2563eb]"
          note={<span className="text-[#2563eb]">⚑ Requires manager approval</span>}
        />
        <StatCard
          label="Active Tasks"
          value={inProgress + todo}
          icon={CheckCircleIcon}
          tile="bg-emerald-50 text-emerald-600"
          note={`${inProgress} In Progress • ${todo} To Do • ${dueThisWeek} Due this week`}
        />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
          Recent Department Leave Requests
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9.5px] font-semibold text-[#2563eb]">{pending.length} Pending</span>
        </h2>
        <Link href={`${basePath}/leave`} className="flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline">
          View All Leaves <ArrowRightIcon className="size-3" />
        </Link>
      </div>
      <FormMessage error={error} />
      {recent.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarCheckIcon} title="No pending leave requests" message="New requests from your team will appear here." />
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-100">
              <tr className="text-[9.5px] font-semibold text-slate-500">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Leave Type</th>
                <th className="px-3 py-2">Schedule / Duration</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <InitialsAvatar name={r.employeeName} className="size-7 bg-blue-50 text-[#2563eb]" />
                      <div className="leading-tight">
                        <p className="text-[11.5px] font-semibold text-slate-900">{r.employeeName}</p>
                        <p className="text-[9.5px] text-slate-500">{r.employeePosition}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-600">{r.typeName}</td>
                  <td className="px-3 py-3 text-[10.5px] leading-[15px] text-slate-600">
                    {formatDay(r.startDate, { month: "short", day: "numeric" })}
                    {r.endDate !== r.startDate && ` – ${formatDay(r.endDate, { month: "short", day: "numeric" })}`},{" "}
                    {r.startDate.slice(0, 4)}
                    <br />({r.workingDays} Day{r.workingDays === 1 ? "" : "s"})
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone="blue">Pending Review</StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => approve(r.id)}
                        disabled={approving === r.id}
                        className={buttonClass("soft", "sm")}
                      >
                        {approving === r.id ? "Approving…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReview({ id: r.id, reject: true })}
                        className="text-[11px] text-slate-500 hover:text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === "task" && (
        <TaskModal tasks={tasks} roster={roster} deptCode={context.departmentCode} onClose={() => setModal(null)} />
      )}
      {modal === "announcement" && (
        <AnnouncementModal departmentName={context.departmentName} teamSize={roster.length} onClose={() => setModal(null)} />
      )}
      {reviewing && (
        <LeaveReviewPanel
          request={reviewing}
          requests={leave.requests}
          types={leave.types}
          roster={roster}
          tasks={tasks}
          focusRemarks={review?.reject}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
