"use client";
import { useDemoDashboard } from "@/lib/employee/demo-store";

import Link from "next/link";
import type { DashboardData } from "@/lib/employee/types";
import { ANNOUNCEMENT_CATEGORY, TASK_PRIORITY, TASK_STATUS } from "@/lib/employee/labels";
import { formatDay, formatIsoDay } from "@/lib/employee/format";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  MegaphoneIcon,
} from "@/components/ui/icons";
import { Card, EmptyState, IconTile, StatusBadge, cx, type IconType } from "../ui";
import { usePortal } from "../portal-context";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: IconType }) {
  return (
    <Card className="flex items-start justify-between px-3.5 py-3">
      <div>
        <p className="text-[10px] text-slate-500">{label}</p>
        <p className="mt-1.5 text-[18px] leading-6 font-bold text-slate-900">{value}</p>
      </div>
      <IconTile icon={icon} />
    </Card>
  );
}

export function attendanceRate(records: DashboardData["attendance"]) {
  const scheduled = records.filter((r) => r.status !== "weekend" && r.status !== "holiday");
  if (!scheduled.length) return null;
  const attended = scheduled.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / scheduled.length) * 1000) / 10;
}

export function DashboardView({
  firstName,
  todayLabel,
  data: initialData,
}: {
  firstName: string;
  todayLabel: string;
  data: DashboardData;
}) {
  const data = useDemoDashboard(initialData);
  const { basePath } = usePortal();
  const rate = attendanceRate(data.attendance);
  const pendingTasks = data.tasks.filter((t) => t.status !== "completed").length;
  const completedTasks = data.tasks.length - pendingTasks;
  const preview = [...data.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5">
        <h1 className="text-[20px] leading-7 font-semibold text-slate-900">Welcome back, {firstName}</h1>
        <p className="mt-0.5 max-w-[640px] text-[12px] leading-[18px] text-slate-500">
          Here is an overview of your attendance, tasks, and recent announcements for today, {todayLabel}.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Attendance This Month" value={rate === null ? "—" : `${rate}%`} icon={CalendarCheckIcon} />
        <StatCard label="Pending Tasks" value={pendingTasks} icon={ClipboardListIcon} />
        <StatCard label="Completed Tasks" value={completedTasks} icon={CheckCircleIcon} />
        <StatCard label="Pending Leave Requests" value={data.pendingLeaves} icon={ClockIcon} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:gap-10">
        <Card className="min-h-[450px] border-slate-300">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-900">
              <ClipboardListIcon className="size-3.5 text-[#2563eb]" />
              My Tasks
              <span className="rounded-full bg-blue-50 px-1.5 text-[10px] text-[#2563eb]">{pendingTasks}</span>
            </h2>
            <Link href={`${basePath}/tasks`} className="flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline">
              View All Tasks <ArrowRightIcon className="size-3" />
            </Link>
          </div>
          {preview.length === 0 ? (
            <EmptyState icon={ClipboardListIcon} title="No tasks assigned" message="Tasks assigned by your manager will appear here." />
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr className="text-[9.5px] font-semibold text-slate-500">
                  <th className="px-4 py-2">Task Name</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2">Priority</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((task) => {
                  const done = task.status === "completed";
                  return (
                    <tr key={task.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3.5">
                        <p className={cx("text-[11.5px] leading-4 font-semibold text-slate-900", done && "text-slate-500 line-through")}>
                          {task.title}
                        </p>
                        {task.project && <p className="mt-0.5 text-[9.5px] text-slate-400">{task.project}</p>}
                      </td>
                      <td className="px-2 py-3.5 text-[10.5px] whitespace-nowrap text-slate-500">{formatDay(task.dueDate)}</td>
                      <td className="px-2 py-3.5">
                        <StatusBadge tone={TASK_PRIORITY[task.priority].tone}>{TASK_PRIORITY[task.priority].label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge tone={TASK_STATUS[task.status].tone} dot={done}>
                          {done && "✓ "}
                          {TASK_STATUS[task.status].label}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="min-h-[450px] border-slate-300">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-900">
              <MegaphoneIcon className="size-3.5 text-[#2563eb]" />
              Latest Announcements
            </h2>
            <Link href={`${basePath}/announcements`} className="flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline">
              View All <ArrowRightIcon className="size-3" />
            </Link>
          </div>
          {data.announcements.length === 0 ? (
            <EmptyState icon={MegaphoneIcon} title="No announcements yet" />
          ) : (
            <ul className="space-y-2.5 px-4 pb-4">
              {data.announcements.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`${basePath}/announcements?open=${a.id}`}
                    className="block rounded-md border border-slate-100 bg-slate-50 px-3.5 py-3 hover:border-slate-200"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-[#2563eb] uppercase">
                        {ANNOUNCEMENT_CATEGORY[a.category]}
                      </span>
                      <span className="text-[9.5px] text-slate-400">{formatIsoDay(a.publishedAt)}</span>
                    </div>
                    <p className="text-[11.5px] font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-[15px] text-slate-500">{a.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
