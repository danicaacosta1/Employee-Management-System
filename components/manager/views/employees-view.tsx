"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import { useMemo, useState } from "react";
import type { ManagerData, DeptEmployee } from "@/lib/manager/types";
import { onLeaveOn, todaysAttendance } from "@/lib/manager/insights";
import { todayKey } from "@/lib/employee/format";
import { CalendarIcon, ClipboardListIcon, EyeIcon, FileTextIcon, ShieldCheckIcon, UsersIcon, ClockIcon } from "@/components/ui/icons";
import {
  Card,
  DataTable,
  EmptyState,
  FilterSelect,
  InitialsAvatar,
  PageHeader,
  buttonClass,
  cx,
  usePaged,
  type Column,
  type IconType,
} from "@/components/employee/ui";
import { EmployeeDetailsModal } from "../employee-modal";
import { EmployeeStatusBadge } from "../status";
import { TaskModal } from "../task-modal";

function SummaryCard({
  label,
  value,
  chip,
  chipClass,
  icon: Icon,
}: {
  label: string;
  value: number;
  chip: string;
  chipClass: string;
  icon: IconType;
}) {
  return (
    <Card className="border-slate-300 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <Icon className="size-3.5 text-slate-500" />
      </div>
      <div className="mt-1.5 flex items-end justify-between">
        <p className="text-[18px] leading-6 font-bold text-slate-900">{value}</p>
        <span className={cx("rounded px-1.5 py-px text-[9px] font-semibold", chipClass)}>{chip}</span>
      </div>
    </Card>
  );
}

type StatusFilter = "all" | "active" | "on_leave" | "probationary";

export function ManagerEmployeesView({ data: initialData }: { data: Pick<ManagerData, "context" | "roster" | "tasks" | "leave" | "attendance"> }) {
  const data = useDemoManager(initialData);
  const { context, roster, tasks, leave, attendance } = data;
  const [position, setPosition] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [details, setDetails] = useState<DeptEmployee | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const today = todayKey();
  const away = useMemo(() => onLeaveOn(leave.requests, today), [leave.requests, today]);
  const att = todaysAttendance(attendance, today);
  const onShift = att.present + att.late;
  const scheduled = leave.requests.filter((r) => r.status === "approved" && r.endDate >= today).length;
  const probationary = roster.filter((p) => p.employmentType === "probationary").length;
  const active = roster.filter((p) => p.employmentStatus === "active").length;
  const isOnLeave = (p: DeptEmployee) => away.has(p.id) || p.employmentStatus === "on_leave";

  const positions = [...new Set(roster.map((p) => p.position).filter((p): p is string => !!p))].sort();
  const filtered = roster.filter(
    (p) =>
      (position === "all" || p.position === position) &&
      (status === "all" ||
        (status === "on_leave" && isOnLeave(p)) ||
        (status === "probationary" && p.employmentType === "probationary") ||
        (status === "active" && p.employmentStatus === "active" && !isOnLeave(p))),
  );
  const paged = usePaged(filtered, 8, `${position}|${status}`);

  const columns: Column<DeptEmployee>[] = [
    {
      key: "id",
      header: "Employee ID",
      className: "pl-14",
      render: (p) => <span className="rounded bg-slate-100 px-1.5 py-1 font-mono text-[9.5px] font-semibold text-slate-600">{p.code}</span>,
    },
    {
      key: "name",
      header: "Employee Name",
      render: (p) => (
        <div className="flex items-center gap-2">
          <InitialsAvatar name={p.name} className="size-7 bg-blue-50 text-[#2563eb]" />
          <div className="leading-tight">
            <p className="text-[11.5px] font-semibold text-slate-900">{p.name}</p>
            <p className="text-[9.5px] text-slate-500">{p.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "position",
      header: "Position",
      render: (p) => (
        <div className="max-w-[150px] leading-tight">
          <p className="text-[10.5px] font-medium text-slate-800">{p.position ?? "—"}</p>
          {p.jobLevel && <p className="text-[9.5px] text-slate-500">{p.jobLevel}</p>}
        </div>
      ),
    },
    { key: "contact", header: "Contact", render: (p) => <span className="text-[10.5px] text-slate-600">{p.phone ?? "—"}</span> },
    { key: "status", header: "Status", render: (p) => <EmployeeStatusBadge employee={p} onLeave={away.has(p.id)} /> },
    {
      key: "actions",
      header: "Actions",
      render: (p) => (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDetails(p)} className={cx(buttonClass("ghost", "sm"), "hover:bg-[#2563eb] hover:text-white")}>
            <EyeIcon className="size-3" /> View Details
          </button>
          <button type="button" onClick={() => setAssignTo(p.id)} disabled={p.role !== "employee" || p.employmentStatus !== "active"} title={p.role !== "employee" || p.employmentStatus !== "active" ? "Tasks can be assigned to active employees only." : undefined} className="flex items-center gap-1 px-1.5 text-[11px] font-semibold text-[#2563eb] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline">
            <ClipboardListIcon className="size-3" /> Assign
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Department Employees"
        subtitle="Directory of engineers, designers, and specialists assigned to your management line."
        actions={
          <button
            type="button"
            disabled
            title="Department notes need the employee notes table, which is not part of the pending migrations."
            className={cx(buttonClass("primary"), "opacity-60")}
          >
            <FileTextIcon className="size-3.5" /> Add Department Note
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Total Headcount" value={roster.length} chip={`${active} Active`} chipClass="bg-emerald-50 text-emerald-600" icon={UsersIcon} />
        <SummaryCard
          label="Active on Shift"
          value={onShift}
          chip={`${roster.length ? Math.round((onShift / roster.length) * 1000) / 10 : 0}% Duty`}
          chipClass="bg-slate-100 text-slate-600"
          icon={ClockIcon}
        />
        <SummaryCard label="Scheduled Leaves" value={scheduled} chip="PTO Planned" chipClass="bg-slate-100 text-slate-600" icon={CalendarIcon} />
        <SummaryCard label="Probationary" value={probationary} chip="Under Review" chipClass="bg-blue-50 text-[#2563eb]" icon={ShieldCheckIcon} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Position"
            prefix="Position:"
            value={position}
            onChange={setPosition}
            className="border-transparent bg-slate-50"
            options={[{ value: "all", label: "All Roles" }, ...positions.map((p) => ({ value: p, label: p }))]}
          />
          <FilterSelect<StatusFilter>
            label="Status"
            prefix="Status:"
            value={status}
            onChange={setStatus}
            className="border-transparent bg-slate-50"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "on_leave", label: "On Leave" },
              { value: "probationary", label: "Probationary" },
            ]}
          />
        </div>
        <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="size-1.5 rounded-full bg-[#2563eb]" />
          Showing {paged.from}-{paged.to} of {paged.total} department employees
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={UsersIcon} title="No employees found" message="No department employees match these filters." />}
      />

      <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
        <p className="text-[10px] text-slate-500">
          Page {paged.page} of {paged.pageCount}
        </p>
        <div className="flex gap-1.5">
          <button type="button" disabled={paged.page <= 1} onClick={() => paged.setPage(paged.page - 1)} className={cx(buttonClass("secondary", "sm"), "disabled:opacity-40")}>
            ‹ Previous
          </button>
          <button type="button" disabled={paged.page >= paged.pageCount} onClick={() => paged.setPage(paged.page + 1)} className={cx(buttonClass("secondary", "sm"), "disabled:opacity-40")}>
            Next ›
          </button>
        </div>
      </div>

      {details && (
        <EmployeeDetailsModal
          employee={details}
          managerName={context.name}
          departmentName={context.departmentName}
          tasks={tasks}
          onClose={() => setDetails(null)}
        />
      )}
      {assignTo && (
        <TaskModal
          tasks={tasks}
          roster={roster}
          deptCode={context.departmentCode}
          presetAssigneeId={assignTo}
          onClose={() => setAssignTo(null)}
        />
      )}
    </div>
  );
}
