"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AttendanceStatus } from "@/lib/employee/types";
import type { DeptAttendance, ManagerData } from "@/lib/manager/types";
import { ATTENDANCE_STATUS } from "@/lib/employee/labels";
import { todaysAttendance } from "@/lib/manager/insights";
import { downloadCsv, formatDay, formatDayWithWeekday, formatDuration, formatTime, todayKey } from "@/lib/employee/format";
import { CalendarIcon, CheckCircleIcon, ClockIcon, DownloadIcon } from "@/components/ui/icons";
import {
  Card,
  DataTable,
  EmptyState,
  FilterSelect,
  InitialsAvatar,
  Pagination,
  SearchInput,
  StatusBadge,
  buttonClass,
  cx,
  usePaged,
  type Column,
  type IconType,
} from "@/components/employee/ui";
import { usePortal } from "@/components/employee/portal-context";

function StatCard({
  label,
  value,
  suffix,
  chip,
  chipClass,
  icon: Icon,
  tile,
}: {
  label: string;
  value: number;
  suffix?: string;
  chip: string;
  chipClass: string;
  icon: IconType;
  tile: string;
}) {
  return (
    <Card className="px-3.5 py-3">
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <span className={cx("flex size-6 items-center justify-center rounded-md", tile)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-1 flex items-center gap-2 text-[20px] leading-7 font-bold text-slate-900">
        {value}
        {suffix && <span className="-ml-1 text-[12px] font-medium text-slate-500">{suffix}</span>}
        <span className={cx("rounded px-1.5 py-px text-[9px] font-semibold", chipClass)}>{chip}</span>
      </p>
    </Card>
  );
}

const STATUS_BADGE: Partial<Record<AttendanceStatus, { label: string; tone: "green" | "amber" | "indigo" | "red" | "gray" | "blue" }>> = {
  late: { label: "Late", tone: "amber" },
  on_leave: { label: "Approved Leave", tone: "indigo" },
};

type StatusFilter = "all" | AttendanceStatus;

export function ManagerAttendanceView({ data: initialData }: { data: Pick<ManagerData, "context" | "roster" | "attendance"> }) {
  const data = useDemoManager(initialData);
  const { basePath } = usePortal();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [shift, setShift] = useState("all");

  const day = todaysAttendance(data.attendance, today);
  const headcount = data.roster.length;
  const shifts = useMemo(
    () => [...new Set(data.attendance.map((r) => r.shiftLabel).filter((s): s is string => !!s))].sort(),
    [data.attendance],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.attendance.filter(
      (r) =>
        (!date || r.workDate === date) &&
        (status === "all" || r.status === status) &&
        (shift === "all" || r.shiftLabel === shift) &&
        (!q || r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q)),
    );
  }, [data.attendance, date, query, status, shift]);
  const paged = usePaged(filtered, 8, `${date}|${query}|${status}|${shift}`);

  const columns: Column<DeptAttendance>[] = [
    { key: "date", header: "Date", className: "pl-12", render: (r) => <span className="whitespace-nowrap text-slate-600">{formatDayWithWeekday(r.workDate)}</span> },
    {
      key: "employee",
      header: "Employee ID & Name",
      render: (r) => (
        <div className="flex items-center gap-2">
          <InitialsAvatar name={r.employeeName} className="size-6 bg-blue-50 text-[#2563eb]" />
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-slate-900">{r.employeeName}</p>
            <p className="font-mono text-[9px] text-slate-400">{r.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: "in",
      header: "Time In",
      render: (r) => <span className={cx(r.status === "late" && "font-semibold text-red-600")}>{formatTime(r.timeIn)}</span>,
    },
    { key: "out", header: "Time Out", render: (r) => formatTime(r.timeOut) },
    {
      key: "hours",
      header: "Total Hours",
      render: (r) =>
        r.timeIn && !r.timeOut ? <StatusBadge tone="blue">Active Shift</StatusBadge> : formatDuration(r.workedMinutes),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const badge = STATUS_BADGE[r.status] ?? ATTENDANCE_STATUS[r.status];
        return (
          <StatusBadge tone={badge.tone} dot={r.status !== "late"}>
            {r.status === "late" && <ClockIcon className="size-2.5" />}
            {badge.label}
          </StatusBadge>
        );
      },
    },
    {
      key: "shift",
      header: "Shift Type / Notes",
      render: (r) => (
        <div className="leading-tight">
          <p className="text-[10.5px] text-slate-600">{r.shiftLabel ?? "—"}</p>
          {r.notes && <p className="text-[9.5px] text-slate-400 italic">{r.notes}</p>}
        </div>
      ),
    },
  ];

  function exportCsv() {
    downloadCsv(`department-attendance-${date || "all"}.csv`, [
      ["Date", "Employee ID", "Employee", "Time In", "Time Out", "Total Hours", "Status", "Shift", "Notes"],
      ...filtered.map((r) => [
        r.workDate,
        r.employeeCode,
        r.employeeName,
        formatTime(r.timeIn),
        formatTime(r.timeOut),
        formatDuration(r.workedMinutes),
        ATTENDANCE_STATUS[r.status].label,
        r.shiftLabel ?? "",
        r.notes ?? "",
      ]),
    ]);
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1" aria-label="Directory views">
          <Link href={`${basePath}/employees`} className="rounded-md px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100">
            Employees
          </Link>
          <span aria-current="page" className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">
            Attendance ●
          </span>
        </nav>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className={cx(buttonClass("secondary"), "disabled:opacity-50")}>
          <DownloadIcon className="size-3.5" /> Download Attendance Report (CSV)
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="mb-1 text-[9.5px] font-semibold tracking-wider uppercase">
            <span className="text-slate-500">Operations Audit</span>
            <span className="ml-1.5 text-emerald-600 normal-case">• Read-Only Manager View</span>
          </p>
          <h1 className="text-[20px] leading-7 font-semibold text-slate-900">Department Attendance</h1>
        </div>
        <p className="text-[11px] text-slate-500">Daily log and time compliance for {data.context.departmentName} team members.</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Present Today"
          value={day.present + day.late}
          suffix={`/ ${headcount}`}
          chip={`↗ ${headcount ? Math.round(((day.present + day.late) / headcount) * 1000) / 10 : 0}%`}
          chipClass="bg-emerald-50 text-emerald-600"
          icon={CheckCircleIcon}
          tile="bg-emerald-100 text-emerald-600"
        />
        <StatCard label="Late Today" value={day.late} chip="Flagged Arrival" chipClass="bg-red-50 text-red-600" icon={ClockIcon} tile="bg-red-50 text-red-400" />
        <StatCard
          label="Absent Today"
          value={day.absent}
          chip={`${day.onLeave} On Leave`}
          chipClass="bg-blue-50 text-[#2563eb]"
          icon={CalendarIcon}
          tile="bg-blue-50 text-[#2563eb]"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] text-slate-700">
          <CalendarIcon className="size-3.5 text-slate-500" />
          <span className="font-semibold whitespace-nowrap">
            {date ? `${date === today ? "Today — " : ""}${formatDay(date, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}` : "All dates"}
          </span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Attendance date"
            className="w-[18px] cursor-pointer text-transparent outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
        </label>
        <SearchInput value={query} onChange={setQuery} placeholder="Search employee name or ID..." className="min-w-[200px] flex-1 border-transparent" />
        <FilterSelect<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All Attendance Statuses" },
            ...(Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]).map((s) => ({ value: s, label: ATTENDANCE_STATUS[s].label })),
          ]}
        />
        <FilterSelect
          label="Shift"
          value={shift}
          onChange={setShift}
          options={[{ value: "all", label: "All Shifts" }, ...shifts.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(r) => r.id}
        headClassName="bg-slate-50"
        empty={<EmptyState icon={CalendarIcon} title="No attendance records" message="No records match this date and filters." />}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] text-slate-500">
          Showing {paged.from} to {paged.to} of {paged.total} records
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} />
      </div>
    </div>
  );
}
