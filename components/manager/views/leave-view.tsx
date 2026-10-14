"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LeaveStatus } from "@/lib/employee/types";
import type { DeptLeave, ManagerData } from "@/lib/manager/types";
import { LEAVE_STATUS } from "@/lib/employee/labels";
import { decideLeave } from "@/lib/manager/actions";
import { downloadCsv, formatDay, formatIsoDay, relativeDay, todayKey } from "@/lib/employee/format";
import { CalendarIcon, CheckCircleIcon, CheckIcon, ClockIcon, DownloadIcon, FilterIcon, XIcon } from "@/components/ui/icons";
import {
  DataTable,
  EmptyState,
  FilterSelect,
  FormMessage,
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
import { LeaveReviewPanel } from "../leave-panel";

function SummaryCard({
  label,
  value,
  unit,
  note,
  noteClass,
  icon: Icon,
  tile,
}: {
  label: string;
  value: number;
  unit: string;
  note: string;
  noteClass: string;
  icon: IconType;
  tile: string;
}) {
  return (
    <div className="rounded-lg border-[1.5px] border-slate-700 bg-white px-3.5 py-3">
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <span className={cx("flex size-7 items-center justify-center rounded-md", tile)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="-mt-1 text-[18px] leading-6 font-bold text-slate-900">
        {value}
        <span className="ml-1 text-[10.5px] font-medium text-slate-500">{unit}</span>
      </p>
      <p className={cx("mt-1 truncate text-[9.5px] font-medium", noteClass)}>{note}</p>
    </div>
  );
}

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

type StatusFilter = "all" | LeaveStatus;

export function ManagerLeaveView({ data: initialData }: { data: Pick<ManagerData, "roster" | "tasks" | "leave"> }) {
  const data = useDemoManager(initialData);
  const router = useRouter();
  const params = useSearchParams();
  const { roster, tasks, leave } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [type, setType] = useState("all");
  const [review, setReview] = useState<{ id: string; reject: boolean } | null>(() => {
    const id = params.get("request");
    return id ? { id, reject: false } : null;
  });
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const month = todayKey().slice(0, 7);
  const pending = leave.requests.filter((r) => r.status === "pending");
  const decidedThisMonth = (s: LeaveStatus) => leave.requests.filter((r) => r.status === s && r.decidedAt && formatIsoDayKey(r.decidedAt) === month);
  const approved = decidedThisMonth("approved");
  const rejected = decidedThisMonth("rejected");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leave.requests.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (type === "all" || r.typeCode === type) &&
        (!q || [r.employeeName, r.employeeCode, r.typeName, r.code].some((v) => v.toLowerCase().includes(q))),
    );
  }, [leave.requests, query, status, type]);
  const paged = usePaged(filtered, 6, `${query}|${status}|${type}`);
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

  function exportCsv() {
    downloadCsv(`leave-history-${month}.csv`, [
      ["Request ID", "Employee ID", "Employee", "Leave Type", "Start", "End", "Working Days", "Submitted", "Status", "Decided", "Remarks"],
      ...filtered.map((r) => [
        r.code,
        r.employeeCode,
        r.employeeName,
        r.typeName,
        r.startDate,
        r.endDate,
        r.workingDays,
        r.submittedAt.slice(0, 10),
        STATUS_LABEL[r.status],
        r.decidedAt?.slice(0, 10) ?? "",
        r.managerRemarks ?? "",
      ]),
    ]);
  }

  const columns: Column<DeptLeave>[] = [
    {
      key: "employee",
      header: "Employee Name & ID",
      className: "pl-12",
      render: (r) => (
        <div className="flex items-center gap-2">
          <InitialsAvatar name={r.employeeName} className="size-7 bg-blue-50 text-[#2563eb]" />
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-slate-900">{r.employeeName}</p>
            <p className="font-mono text-[9px] text-slate-400">{r.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Leave Type",
      render: (r) => (
        <div className="leading-tight">
          <p className="text-[11px] text-slate-800">{r.typeName}</p>
          <p className="text-[9.5px] text-slate-400">{r.attachmentName ? "Document Attached" : r.code}</p>
        </div>
      ),
    },
    {
      key: "window",
      header: "Inclusive Window",
      render: (r) => (
        <div className="text-[10.5px] leading-[15px] text-slate-700">
          {formatDay(r.startDate, { month: "short", day: "numeric" })}
          {r.endDate !== r.startDate && ` – ${formatDay(r.endDate, { month: "short", day: "numeric" })}`}, {r.startDate.slice(0, 4)}
          <p className="text-[9.5px] text-slate-400">
            {r.workingDays} Business Day{r.workingDays === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (r) => (
        <div className="leading-tight">
          <p className="text-[10.5px] text-slate-700">{formatIsoDay(r.submittedAt)}</p>
          <p className="text-[9.5px] text-slate-400">{r.decidedAt ? `Decided ${formatIsoDay(r.decidedAt)}` : relativeDay(r.submittedAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge tone={LEAVE_STATUS[r.status].tone}>{STATUS_LABEL[r.status]}</StatusBadge>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status === "pending" ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => approve(r.id)}
              disabled={approving === r.id}
              aria-label={`Approve ${r.code}`}
              title="Approve"
              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
            >
              <CheckIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setReview({ id: r.id, reject: true })}
              aria-label={`Reject ${r.code}`}
              title="Reject (remarks required)"
              className="rounded p-1 text-red-600 hover:bg-red-50"
            >
              <XIcon className="size-3.5" />
            </button>
            <button type="button" onClick={() => setReview({ id: r.id, reject: false })} className={buttonClass("soft", "sm")}>
              Review Request
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setReview({ id: r.id, reject: false })} className="text-[10.5px] text-slate-400 italic hover:text-slate-600">
            Processed
          </button>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[9.5px] font-semibold tracking-wider text-slate-500 uppercase">Workforce Operations / Approvals Queue</p>
          <h1 className="text-[20px] leading-7 font-semibold text-slate-900">Department Leave Requests</h1>
          <p className="max-w-[300px] text-[11.5px] leading-[17px] text-slate-500">
            Review time-off applications, check team coverage, and process approval decisions.
          </p>
        </div>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className={cx(buttonClass("ghost"), "disabled:opacity-50")}>
          <DownloadIcon className="size-3.5" /> Download Leave History
        </button>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Pending Review"
          value={pending.length}
          unit={pending.length === 1 ? "Request" : "Requests"}
          note={pending.length ? "● Requires your immediate decision" : "No requests awaiting decision"}
          noteClass={pending.length ? "text-red-600" : "text-slate-500"}
          icon={ClockIcon}
          tile="bg-blue-50 text-[#2563eb]"
        />
        <SummaryCard
          label="Approved (This Month)"
          value={approved.length}
          unit={approved.length === 1 ? "Request" : "Requests"}
          note={`● Total ${approved.reduce((s, r) => s + r.workingDays, 0)} business days scheduled`}
          noteClass="text-emerald-600"
          icon={CheckCircleIcon}
          tile="bg-emerald-100 text-emerald-600"
        />
        <SummaryCard
          label="Rejected (This Month)"
          value={rejected.length}
          unit={rejected.length === 1 ? "Request" : "Requests"}
          note={rejected[0]?.managerRemarks ? `● ${rejected[0].managerRemarks}` : "No rejections this month"}
          noteClass="text-slate-500"
          icon={XIcon}
          tile="bg-slate-100 text-slate-500"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search employee name or leave type..." className="w-full sm:w-[420px]" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect<StatusFilter>
            label="Status"
            prefix="Status:"
            value={status}
            onChange={setStatus}
            options={[
              { value: "pending", label: `Pending Approval (${pending.length})` },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "all", label: "All" },
            ]}
          />
          <FilterSelect
            label="Leave type"
            prefix="Leave Type:"
            value={type}
            onChange={setType}
            options={[{ value: "all", label: "All Types" }, ...leave.types.map((t) => ({ value: t.code, label: t.name }))]}
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setType("all");
            }}
            aria-label="Show all requests"
            title="Show all requests"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <FilterIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <FormMessage error={error} />

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(r) => r.id}
        headClassName="bg-[#eef3fe]"
        empty={<EmptyState icon={CalendarIcon} title="No leave requests" message="Nothing matches these filters." />}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500">
          Showing {paged.rows.length} of {paged.total} total requests
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} />
      </div>

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

/** YYYY-MM of an ISO instant in the company timezone. */
function formatIsoDayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7);
}
