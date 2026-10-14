"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LeaveType } from "@/lib/employee/types";
import type { DeptEmployee, DeptLeave, DeptTask } from "@/lib/manager/types";
import { LEAVE_STATUS } from "@/lib/employee/labels";
import { decideLeave, getLeaveAttachmentUrl } from "@/lib/manager/actions";
import { leaveBalance, tasksDueDuring, teamCoverage } from "@/lib/manager/insights";
import { formatDay, formatIsoDay, formatTime, relativeTime } from "@/lib/employee/format";
import { CheckIcon, ClipboardListIcon, FileTextIcon, InfoIcon, SpinnerIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { FormMessage, InitialsAvatar, SlideOver, StatusBadge, buttonClass, cx } from "@/components/employee/ui";

const COVERAGE_TONE = {
  Sufficient: "bg-emerald-100 text-emerald-700",
  Limited: "bg-amber-100 text-amber-700",
  "At Risk": "bg-red-100 text-red-700",
} as const;

export function LeaveReviewPanel({
  request,
  requests,
  types,
  roster,
  tasks,
  focusRemarks,
  onClose,
}: {
  request: DeptLeave;
  requests: DeptLeave[];
  types: LeaveType[];
  roster: DeptEmployee[];
  tasks: DeptTask[];
  focusRemarks?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [remarks, setRemarks] = useState(request.managerRemarks ?? "");
  const [result, setResult] = useState<{ error?: string; fieldErrors?: Record<string, string> }>({});
  const [pending, startTransition] = useTransition();
  const [deciding, setDeciding] = useState<"approved" | "rejected" | null>(null);
  const employee = roster.find((p) => p.id === request.employeeId);
  const balance = leaveBalance(requests, types, request);
  const coverage = teamCoverage(request, roster, requests);
  const dueTasks = tasksDueDuring(request, tasks);
  const decided = request.status !== "pending";

  function decide(decision: "approved" | "rejected") {
    if (decision === "rejected" && !remarks.trim())
      return setResult({ fieldErrors: { remarks: "Add remarks to reject this request." } });
    setDeciding(decision);
    startTransition(async () => {
      const res = await decideLeave(request.id, decision, remarks);
      setDeciding(null);
      if (res.ok) {
        router.refresh();
        onClose();
      } else setResult(res);
    });
  }

  async function openAttachment() {
    const res = await getLeaveAttachmentUrl(request.id);
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else setResult({ error: res.error });
  }

  const spec: [string, ReactNode][] = [
    ["Leave Category", request.typeName],
    [
      "Inclusive Dates",
      request.startDate === request.endDate
        ? formatDay(request.startDate)
        : `${formatDay(request.startDate, { month: "short", day: "numeric" })} – ${formatDay(request.endDate)}`,
    ],
    [
      "Duration Total",
      <span key="d" className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563eb]">
        {request.workingDays} Business Day{request.workingDays === 1 ? "" : "s"}
      </span>,
    ],
    ["Submission Timestamp", `${formatIsoDay(request.submittedAt)} at ${formatTime(request.submittedAt)}`],
  ];

  return (
    <SlideOver
      open
      onClose={onClose}
      header={
        <div className="flex items-start gap-2">
          <FileTextIcon className="mt-0.5 size-3.5 text-[#2563eb]" />
          <div>
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900">
              Leave Application
              <span className="rounded bg-blue-100 px-1.5 py-px text-[9.5px] font-semibold text-[#2563eb]">#{request.code}</span>
            </p>
            <p className="text-[9.5px] text-slate-500">Submitted {relativeTime(request.submittedAt)}</p>
          </div>
        </div>
      }
      footer={
        decided ? (
          <div className="flex w-full items-center justify-between">
            <StatusBadge tone={LEAVE_STATUS[request.status].tone}>{LEAVE_STATUS[request.status].label}</StatusBadge>
            <button type="button" onClick={onClose} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        ) : (
          <>
            <button type="button" onClick={onClose} className={buttonClass("secondary")}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => decide("rejected")}
              disabled={pending}
              className={cx(buttonClass("secondary"), "flex-1 border-red-200 bg-red-50 text-red-600 hover:bg-red-100")}
            >
              {deciding === "rejected" ? <SpinnerIcon className="size-3.5 animate-spin" /> : <XIcon className="size-3.5" />}
              Reject Leave
            </button>
            <button type="button" onClick={() => decide("approved")} disabled={pending} className={cx(buttonClass("primary"), "flex-1")}>
              {deciding === "approved" ? <SpinnerIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
              Approve Leave
            </button>
          </>
        )
      }
    >
      <div className="mb-4 rounded-md bg-slate-50 px-3 py-3">
        <div className="mb-2.5 flex items-center gap-2.5">
          <InitialsAvatar name={request.employeeName} className="size-9 text-[11px]" />
          <div className="leading-tight">
            <p className="text-[12.5px] font-semibold text-slate-900">{request.employeeName}</p>
            <p className="text-[10px] text-slate-500">
              {[request.employeePosition ?? employee?.position, request.employeeCode].filter(Boolean).join(" • ")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded bg-white px-2.5 py-2">
          <div>
            <p className="text-[8.5px] font-semibold tracking-wider text-slate-500 uppercase">{request.typeName} Balance</p>
            <p className="text-[11.5px] font-semibold text-slate-900">
              {balance ? `${balance.remaining.toFixed(1)} Days Left` : "Not tracked"}
            </p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold tracking-wider text-slate-500 uppercase">Balance Post-Approval</p>
            <p className={cx("text-[11.5px] font-semibold", balance && balance.afterApproval < 0 ? "text-red-600" : "text-emerald-600")}>
              {balance ? `${balance.afterApproval.toFixed(1)} Days Left` : "—"}
            </p>
          </div>
        </div>
      </div>

      <h3 className="mb-1.5 text-[11.5px] font-semibold text-slate-900">Application Specification</h3>
      <dl className="mb-4 space-y-1.5 rounded-md bg-slate-50 px-3 py-2.5 text-[10.5px]">
        {spec.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-800">{value}</dd>
          </div>
        ))}
        {request.attachmentName && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">Supporting Document</dt>
            <dd>
              <button type="button" onClick={openAttachment} className="font-semibold text-[#2563eb] hover:underline">
                {request.attachmentName}
              </button>
            </dd>
          </div>
        )}
      </dl>

      <h3 className="mb-1.5 text-[11.5px] font-semibold text-slate-900">Reason Stated by Employee</h3>
      <p className="mb-4 rounded-md bg-slate-50 px-3 py-2.5 text-[11px] leading-[16px] text-slate-700">“{request.reason}”</p>

      <div className="mb-4 rounded-md border border-slate-200 px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-900">
            <UsersIcon className="size-3.5 text-[#2563eb]" /> Team Coverage Assessment
          </p>
          {coverage.total > 0 && (
            <span className={cx("rounded px-1.5 py-px text-[9.5px] font-semibold", COVERAGE_TONE[coverage.level])}>{coverage.level}</span>
          )}
        </div>
        {coverage.total === 0 ? (
          <p className="text-[10.5px] text-slate-500">No other team members on record — coverage unavailable.</p>
        ) : (
          <>
            <p className="text-[10.5px] text-slate-600">
              <span className="font-semibold text-slate-800">
                {coverage.available} of {coverage.total} team members
              </span>{" "}
              on active duty during this window
              {coverage.away.length > 0 && ` (${coverage.away.map((p) => p.name).join(", ")} also away)`}.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${coverage.percent}%` }} />
              </div>
              <span className="text-[9.5px] text-slate-500">{coverage.percent}% capacity maintained</span>
            </div>
          </>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <ClipboardListIcon className="size-3" />
          {dueTasks.length
            ? `${dueTasks.length} open task${dueTasks.length === 1 ? "" : "s"} due during this leave: ${dueTasks.map((t) => t.code).join(", ")}`
            : "No open tasks due during this leave."}
        </p>
      </div>

      <label htmlFor="leave-remarks" className="mb-1 block text-[11px] font-semibold text-slate-900">
        Manager Remarks / Handover Notes{" "}
        <span className="font-normal text-slate-400">(Optional for approve, required for rejection)</span>
      </label>
      <textarea
        id="leave-remarks"
        value={remarks}
        maxLength={1000}
        rows={3}
        autoFocus={focusRemarks}
        disabled={decided}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Add specific instructions, coverage conditions, or rejection rationale..."
        className="w-full resize-none rounded-md border border-transparent bg-[#eef2f7] px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-[#2563eb] focus:bg-white disabled:opacity-70"
      />
      {result.fieldErrors?.remarks && <p className="mt-1 text-[10.5px] text-red-600">{result.fieldErrors.remarks}</p>}

      <p className="mt-3 mb-2 flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[9.5px] text-slate-500">
        <InfoIcon className="mt-px size-3 shrink-0" />
        Your decision and remarks appear in {request.employeeName.split(" ")[0]}&apos;s Leave Requests immediately.
      </p>
      <FormMessage error={result.error} />
    </SlideOver>
  );
}
