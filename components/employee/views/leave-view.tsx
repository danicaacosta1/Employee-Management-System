"use client";
import { useDemoRows } from "@/lib/employee/demo-store";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LeaveData, LeaveRequest, LeaveStatus } from "@/lib/employee/types";
import { LEAVE_STATUS } from "@/lib/employee/labels";
import { countWorkingDays, downloadCsv, formatDay, formatIsoDay, todayKey } from "@/lib/employee/format";
import { submitLeaveRequest, type ActionResult } from "@/lib/employee/actions";
import {
  AlertTriangleIcon,
  BriefcaseMedicalIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  FilterIcon,
  InfoIcon,
  PlaneIcon,
  PlusIcon,
  SpinnerIcon,
  UploadCloudIcon,
  UserIcon,
  XIcon,
} from "@/components/ui/icons";
import {
  Card,
  DataTable,
  EmptyState,
  FilterSelect,
  FormField,
  FormMessage,
  InitialsAvatar,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  buttonClass,
  cx,
  inputClass,
  usePaged,
  type Column,
  type IconType,
} from "../ui";

const TYPE_ICON: Record<string, IconType> = {
  vacation: PlaneIcon,
  sick: BriefcaseMedicalIcon,
  personal: UserIcon,
  emergency: AlertTriangleIcon,
};

function SummaryCard({
  label,
  badge,
  value,
  unit,
  note,
}: {
  label: string;
  badge: ReactNode;
  value: number;
  unit: string;
  note: ReactNode;
}) {
  return (
    <div className="border-slate-200 px-1 py-1 sm:border-r sm:pr-6 sm:last:border-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        {badge}
      </div>
      <p className="text-[22px] leading-7 font-bold text-slate-900">
        {value}
        <span className="ml-1.5 text-[11px] font-medium text-slate-500">{unit}</span>
      </p>
      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">{note}</p>
    </div>
  );
}

/* --------------------------------------------------------- submit request */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function NewLeaveModal({ data, onClose }: { data: LeaveData; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [typeId, setTypeId] = useState(data.types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const days = countWorkingDays(start, end);
  const today = todayKey();

  function pickFile(next: File | undefined) {
    if (!next) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(next.type))
      return setResult({ fieldErrors: { document: "Upload a PDF, PNG, or JPG file." } });
    if (next.size > MAX_FILE_BYTES) return setResult({ fieldErrors: { document: "File must be 5MB or smaller." } });
    setResult({});
    setFile(next);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    if (!typeId) fieldErrors.leaveTypeId = "Select a leave type.";
    if (!start) fieldErrors.startDate = "Select a start date.";
    if (!end) fieldErrors.endDate = "Select an end date.";
    else if (start && end < start) fieldErrors.endDate = "End date must be on or after the start date.";
    else if (start && days === 0) fieldErrors.endDate = "The selected range has no working days.";
    if (reason.trim().length < 10) fieldErrors.reason = "Use at least 10 characters.";
    if (Object.keys(fieldErrors).length) return setResult({ fieldErrors });

    const form = new FormData();
    form.set("leaveTypeId", typeId);
    form.set("startDate", start);
    form.set("endDate", end);
    form.set("reason", reason);
    form.set("clientRequestId", clientRequestId);
    if (file) form.set("document", file);
    startTransition(async () => {
      const res = await submitLeaveRequest(form, data.types);
      if (res.ok) {
        router.refresh();
        onClose();
      } else setResult(res);
    });
  }

  const err = result.fieldErrors ?? {};
  return (
    <Modal
      open
      onClose={onClose}
      title="Submit Leave Request"
      subtitle="Employee Self-Service Application"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="submit" form="leave-form" disabled={pending} className={cx(buttonClass("primary"), "px-5")}>
            {pending && <SpinnerIcon className="size-3.5 animate-spin" />}
            Submit Request
          </button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} noValidate className="space-y-3">
        <FormField label="Leave Type" required htmlFor="leave-type" error={err.leaveTypeId}>
          <select id="leave-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={inputClass}>
            {data.types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date" required htmlFor="leave-start" error={err.startDate}>
            <input id="leave-start" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="End Date" required htmlFor="leave-end" error={err.endDate}>
            <input id="leave-end" type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </FormField>
        </div>

        <div className="flex items-center justify-between rounded-md bg-[#eef3fe] px-2.5 py-2 text-[10.5px]">
          <span className="flex items-center gap-1 text-slate-600">
            <CalendarIcon className="size-3" /> Calculated Period
          </span>
          <span className="font-semibold text-[#2563eb]">
            Total: {days} Business Day{days === 1 ? "" : "s"}
          </span>
        </div>

        <FormField label="Reason for Absence" required htmlFor="leave-reason" error={err.reason}>
          <textarea
            id="leave-reason"
            value={reason}
            maxLength={300}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly describe the reason for your leave"
            className={cx(inputClass, "h-auto resize-none py-2")}
          />
          <p className="mt-0.5 text-right text-[9.5px] text-slate-400">{reason.length} / 300 characters</p>
        </FormField>

        <FormField label="Supporting Documents" aside={<span className="text-[9.5px] text-slate-400">Optional</span>} error={err.document}>
          {file ? (
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                <FileTextIcon className="size-3.5 shrink-0 text-[#2563eb]" />
                <span className="truncate">{file.name}</span>
              </span>
              <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Remove file" className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files[0]);
              }}
              className={cx(
                "flex w-full flex-col items-center rounded-md border border-dashed px-3 py-4 text-center",
                dragging ? "border-[#2563eb] bg-blue-50" : "border-slate-300 bg-[#eef3fe]/60",
              )}
            >
              <UploadCloudIcon className="mb-1 size-4 text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-800">Click to upload or drag &amp; drop</span>
              <span className="text-[9.5px] text-slate-500">PDF, PNG, JPG up to 5MB</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </FormField>

        <div className="flex items-center gap-2 rounded-md bg-[#eef3fe] px-3 py-2">
          {data.approver ? (
            <>
              <InitialsAvatar name={data.approver.name} className="size-7 bg-[#2563eb] text-white" />
              <div className="leading-tight">
                <p className="text-[9px] text-slate-500">Primary Approver</p>
                <p className="text-[11px] font-semibold text-slate-900">
                  {data.approver.name}
                  {data.approver.position && ` (${data.approver.position})`}
                </p>
              </div>
            </>
          ) : (
            <p className="text-[10.5px] text-slate-500">No approver assigned yet. HR will route your request.</p>
          )}
        </div>
        <FormMessage error={result.error} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------- details */

function DetailsModal({ request, onClose }: { request: LeaveRequest; onClose: () => void }) {
  const status = LEAVE_STATUS[request.status];
  const rows: [string, ReactNode][] = [
    ["Request ID", request.code],
    ["Leave Type", request.typeName],
    ["Start Date", formatDay(request.startDate)],
    ["End Date", formatDay(request.endDate)],
    ["Duration", `${request.workingDays} ${request.workingDays === 1 ? "Day" : "Days"}`],
    ["Date Submitted", formatIsoDay(request.submittedAt)],
    ["Status", <StatusBadge key="s" tone={status.tone}>{status.label}</StatusBadge>],
    ["Decided On", request.decidedAt ? formatIsoDay(request.decidedAt) : "—"],
    ["Attachment", request.attachmentName ?? "None"],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title="Leave Request Details"
      subtitle={request.code}
      footer={
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          Close
        </button>
      }
    >
      <dl className="space-y-2 text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2.5">
        <p className="mb-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Reason</p>
        <p className="text-[11.5px] text-slate-700">{request.reason}</p>
      </div>
      {request.managerRemarks && (
        <div className="mt-2 rounded-md bg-slate-50 px-3 py-2.5">
          <p className="mb-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Manager Remarks</p>
          <p className="text-[11.5px] text-slate-700">{request.managerRemarks}</p>
        </div>
      )}
    </Modal>
  );
}

function PolicyModal({ data, onClose }: { data: LeaveData; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Leave Policy"
      subtitle="Annual entitlements by leave type"
      icon={FileTextIcon}
      footer={
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          Close
        </button>
      }
    >
      <ul className="divide-y divide-slate-100 text-[11.5px]">
        {data.types.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2">
            <span className="text-slate-700">{t.name}</span>
            <span className="font-semibold text-slate-900">{t.annualDays === null ? "As approved" : `${t.annualDays} days / year`}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-[10px] text-slate-500">
        <InfoIcon className="mt-px size-3 shrink-0" />
        Durations count working days (Monday–Friday). Requests are reviewed by your assigned approver.
      </p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- page */

type StatusFilter = "all" | LeaveStatus;

export function LeaveView({ data: initialData }: { data: LeaveData }) {
  const requests = useDemoRows("leave", initialData.requests);
  const data = { ...initialData, requests };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("all");
  const [modal, setModal] = useState<"new" | "policy" | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const year = todayKey().slice(0, 4);
  const thisYear = data.requests.filter((r) => r.startDate.startsWith(year));
  const pending = data.requests.filter((r) => r.status === "pending");
  const approvedDays = thisYear.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.workingDays, 0);
  const rejected = thisYear.filter((r) => r.status === "rejected").length;
  const entitlement = data.types.reduce((sum, t) => sum + (t.annualDays ?? 0), 0);
  const latestPending = pending[0];

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    return data.requests.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (type === "all" || r.typeCode === type) &&
        (!q || [r.code, r.typeName, r.reason].some((v) => v.toLowerCase().includes(q))),
    );
  })();
  const paged = usePaged(filtered, 8, `${query}|${status}|${type}`);
  const details = data.requests.find((r) => r.id === detailsId) ?? null;

  const columns: Column<LeaveRequest>[] = [
    {
      key: "type",
      header: "Leave Type",
      className: "pl-16",
      render: (r) => {
        const Icon = TYPE_ICON[r.typeCode] ?? FileTextIcon;
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-[#2563eb]">
              <Icon className="size-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[11.5px] font-semibold text-slate-900">{r.typeName}</p>
              <p className="text-[9.5px] text-slate-400">{r.code}</p>
            </div>
          </div>
        );
      },
    },
    { key: "start", header: "Start Date", render: (r) => formatDay(r.startDate) },
    { key: "end", header: "End Date", render: (r) => formatDay(r.endDate) },
    { key: "duration", header: "Duration", render: (r) => `${r.workingDays} ${r.workingDays === 1 ? "Day" : "Days"}` },
    { key: "submitted", header: "Date Submitted", render: (r) => formatIsoDay(r.submittedAt) },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge tone={LEAVE_STATUS[r.status].tone}>{LEAVE_STATUS[r.status].label}</StatusBadge>,
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <button type="button" onClick={() => setDetailsId(r.id)} className="text-[11px] font-semibold text-[#2563eb] hover:underline">
          View Details
        </button>
      ),
    },
  ];

  function exportCsv() {
    downloadCsv(`leave-requests-${year}.csv`, [
      ["Request ID", "Leave Type", "Start Date", "End Date", "Working Days", "Date Submitted", "Status"],
      ...filtered.map((r) => [r.code, r.typeName, r.startDate, r.endDate, r.workingDays, r.submittedAt.slice(0, 10), LEAVE_STATUS[r.status].label]),
    ]);
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Leave Requests"
        subtitle={<span className="block max-w-[190px]">Manage and submit your annual, sick, and personal leave applications.</span>}
        actions={
          <>
            <button type="button" onClick={() => setModal("policy")} className={buttonClass("ghost")}>
              <FileTextIcon className="size-3.5" /> Leave Policy
            </button>
            <button type="button" onClick={() => setModal("new")} disabled={!data.types.length} className={buttonClass("primary")}>
              <PlusIcon className="size-3.5" /> New Leave Request
            </button>
          </>
        }
      />

      <Card className="mb-6 grid gap-5 border-transparent px-3 py-3 shadow-none sm:grid-cols-3">
        <SummaryCard
          label="Pending Approval"
          badge={<StatusBadge tone="blue">Under Review</StatusBadge>}
          value={pending.length}
          unit={pending.length === 1 ? "Request" : "Requests"}
          note={
            <>
              <ClockIcon className="size-3 text-[#2563eb]" />
              {latestPending ? `${latestPending.typeName} submitted ${formatDay(latestPending.submittedAt.slice(0, 10), { month: "short", day: "numeric" })}` : "No requests awaiting approval"}
            </>
          }
        />
        <SummaryCard
          label="Approved This Year"
          badge={<StatusBadge tone="blue">Up to Date</StatusBadge>}
          value={approvedDays}
          unit={approvedDays === 1 ? "Day" : "Days"}
          note={
            <>
              <CheckCircleIcon className="size-3 text-emerald-600" />
              Remaining balance: {Math.max(0, entitlement - approvedDays)} Days
            </>
          }
        />
        <SummaryCard
          label="Rejected"
          badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-semibold text-slate-500">Audit Compliant</span>}
          value={rejected}
          unit={rejected === 1 ? "Request" : "Requests"}
          note={
            <>
              <InfoIcon className="size-3" />
              {rejected ? "Review manager remarks in details" : "All requests in compliance"}
            </>
          }
        />
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter requests by keyword..." className="w-full sm:w-[310px]" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect<StatusFilter>
            label="Status"
            icon={FilterIcon}
            prefix="Status:"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              ...(Object.keys(LEAVE_STATUS) as LeaveStatus[]).map((s) => ({ value: s, label: LEAVE_STATUS[s].label })),
            ]}
          />
          <FilterSelect
            label="Leave type"
            icon={FilterIcon}
            prefix="Type:"
            value={type}
            onChange={setType}
            options={[{ value: "all", label: "All" }, ...data.types.map((t) => ({ value: t.code, label: t.name }))]}
          />
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className={cx(buttonClass("secondary"), "h-8 text-[11px] disabled:opacity-50")}>
            <DownloadIcon className="size-3.5" /> Export
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={CalendarIcon} title="No leave requests" message="Submit a new leave request to see it here." />}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] text-slate-500">
          Showing {paged.rows.length} of {paged.total} leave records
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} labels={["Previous", "Next"]} />
      </div>

      {modal === "new" && <NewLeaveModal data={data} onClose={() => setModal(null)} />}
      {modal === "policy" && <PolicyModal data={data} onClose={() => setModal(null)} />}
      {details && <DetailsModal request={details} onClose={() => setDetailsId(null)} />}
    </div>
  );
}

