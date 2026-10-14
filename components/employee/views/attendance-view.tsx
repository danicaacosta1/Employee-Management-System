"use client";

import { useMemo, useState } from "react";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/employee/types";
import { ATTENDANCE_STATUS } from "@/lib/employee/labels";
import {
  downloadCsv,
  formatDayWithWeekday,
  formatDuration,
  formatMonth,
  formatTime,
  monthKey,
  todayKey,
} from "@/lib/employee/format";
import { CalendarIcon, CheckCircleIcon, ClockIcon, DownloadIcon, FilterIcon } from "@/components/ui/icons";
import {
  Card,
  DataTable,
  EmptyState,
  FilterSelect,
  IconTile,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  buttonClass,
  cx,
  usePaged,
  type Column,
  type IconType,
} from "../ui";

function SummaryCard({
  label,
  value,
  icon,
  tile,
}: {
  label: string;
  value: number;
  icon: IconType;
  tile: string;
}) {
  return (
    <Card className="flex items-center justify-between px-4 py-3.5">
      <div>
        <p className="text-[9.5px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <p className="mt-1 text-[22px] leading-7 font-bold text-slate-900">
          {value}
          <span className="ml-1 text-[11px] font-medium text-slate-500">{value === 1 ? "Day" : "Days"}</span>
        </p>
      </div>
      <IconTile icon={icon} className={tile} />
    </Card>
  );
}

type StatusFilter = "all" | AttendanceStatus;

export function AttendanceView({ records, currentMonth }: { records: AttendanceRecord[]; currentMonth: string }) {
  const months = useMemo(() => {
    const keys = new Set([currentMonth, ...records.map((r) => monthKey(r.workDate))]);
    return [...keys].sort().reverse();
  }, [records, currentMonth]);

  const [month, setMonth] = useState(currentMonth);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const inMonth = useMemo(() => records.filter((r) => monthKey(r.workDate) === month), [records, month]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inMonth.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q ||
          formatDayWithWeekday(r.workDate).toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q) ||
          (r.shiftLabel ?? "").toLowerCase().includes(q)),
    );
  }, [inMonth, status, query]);

  const paged = usePaged(filtered, 10, `${month}|${status}|${query}`);
  const count = (s: AttendanceStatus) => inMonth.filter((r) => r.status === s).length;
  const today = todayKey();

  const columns: Column<AttendanceRecord>[] = [
    {
      key: "date",
      header: "Date",
      className: "pl-14",
      render: (r) => (
        <span className={cx("font-semibold whitespace-nowrap text-slate-800", r.status === "weekend" && "font-normal text-slate-400")}>
          {formatDayWithWeekday(r.workDate)}
          {r.workDate === today && (
            <span className="ml-1.5 rounded bg-blue-100 px-1 py-px text-[8.5px] font-bold text-[#2563eb]">TODAY</span>
          )}
        </span>
      ),
    },
    { key: "in", header: "Time In", render: (r) => formatTime(r.timeIn) },
    { key: "out", header: "Time Out", render: (r) => formatTime(r.timeOut) },
    { key: "hours", header: "Total Hours", render: (r) => formatDuration(r.workedMinutes) },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge tone={ATTENDANCE_STATUS[r.status].tone}>{ATTENDANCE_STATUS[r.status].label}</StatusBadge>,
    },
    {
      key: "notes",
      header: "Shift Type / Notes",
      render: (r) => (
        <span className={cx(r.status === "weekend" || r.notes ? "text-slate-500" : "text-slate-600")}>
          {r.notes ?? r.shiftLabel ?? "—"}
        </span>
      ),
    },
  ];

  function exportCsv() {
    downloadCsv(`attendance-${month}.csv`, [
      ["Date", "Time In", "Time Out", "Total Hours", "Status", "Shift / Notes"],
      ...filtered.map((r) => [
        r.workDate,
        formatTime(r.timeIn),
        formatTime(r.timeOut),
        formatDuration(r.workedMinutes),
        ATTENDANCE_STATUS[r.status].label,
        r.notes ?? r.shiftLabel ?? "",
      ]),
    ]);
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Attendance Records" subtitle="Monthly record of your daily check-in, check-out, and shift hours." />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Present" value={count("present")} icon={CheckCircleIcon} tile="bg-emerald-100 text-emerald-600" />
        <SummaryCard label="Late" value={count("late")} icon={ClockIcon} tile="bg-slate-800 text-white" />
        <SummaryCard label="Absent" value={count("absent")} icon={CalendarIcon} tile="bg-slate-100 text-slate-500" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Month"
            icon={CalendarIcon}
            value={month}
            onChange={setMonth}
            options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
          />
          <FilterSelect<StatusFilter>
            label="Status"
            icon={FilterIcon}
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All Statuses" },
              ...(Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]).map((s) => ({
                value: s,
                label: ATTENDANCE_STATUS[s].label,
              })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search date, notes..." className="w-56" />
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className={cx(buttonClass("soft"), "disabled:opacity-50")}>
            <DownloadIcon className="size-3.5" /> Download CSV
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={CalendarIcon} title="No attendance records" message="No records match this month and filter." />}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] text-slate-500">
          Showing {paged.from} to {paged.to} of {paged.total} records
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} />
      </div>
    </div>
  );
}
