"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority } from "@/lib/employee/types";
import type { DeptEmployee, DeptTask } from "@/lib/manager/types";
import { createTask } from "@/lib/manager/actions";
import { todayKey } from "@/lib/employee/format";
import { CheckIcon, ClipboardListIcon, InfoIcon, SpinnerIcon } from "@/components/ui/icons";
import { FormField, FormMessage, InitialsAvatar, Modal, Segmented, buttonClass, cx, inputClass } from "@/components/employee/ui";
import { EmployeeStatusBadge } from "./status";

export function EmployeeDetailsModal({
  employee,
  managerName,
  departmentName,
  tasks,
  onClose,
}: {
  employee: DeptEmployee;
  managerName: string;
  departmentName: string;
  tasks: DeptTask[];
  onClose: () => void;
}) {
  const router = useRouter();
  const today = todayKey();
  const firstName = employee.name.split(" ")[0];
  const open = tasks.filter((t) => t.assigneeId === employee.id && t.status !== "completed");
  const inProgress = open.filter((t) => t.status === "in_progress").length;
  const overdue = open.filter((t) => t.dueDate < today).length;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [result, setResult] = useState<{ error?: string; message?: string; fieldErrors?: Record<string, string> }>({});
  const [pending, startTransition] = useTransition();

  function assign() {
    const fieldErrors: Record<string, string> = {};
    if (title.trim().length < 3) fieldErrors.title = "Use at least 3 characters.";
    if (!dueDate) fieldErrors.dueDate = "Select a due date.";
    else if (dueDate < today) fieldErrors.dueDate = "Due date can't be in the past.";
    if (Object.keys(fieldErrors).length) return setResult({ fieldErrors });
    startTransition(async () => {
      const res = await createTask({ assigneeId: employee.id, title, description, dueDate, priority, status: "todo" }, [employee]);
      if (res.ok) {
        setTitle("");
        setDescription("");
        setDueDate("");
        setResult({ message: res.message });
        router.refresh();
      } else setResult(res);
    });
  }

  const err = result.fieldErrors ?? {};
  const facts: [string, string][] = [
    ["Department", departmentName],
    ["Direct Manager", managerName],
    ["Official Email", employee.email],
    ["Phone Contact", employee.phone ?? "—"],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Employee Details"
      width="max-w-[460px]"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Close
          </button>
          <button type="button" onClick={assign} disabled={pending} className={buttonClass("primary")}>
            {pending ? <SpinnerIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            Assign Task
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-slate-50 px-3 py-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <InitialsAvatar name={employee.name} className="size-10 rounded-md text-[12px]" />
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-slate-900">{employee.name}</p>
              <p className="font-mono text-[9.5px] text-slate-500">{employee.code}</p>
              <p className="text-[11px] text-slate-700">{employee.position ?? "—"}</p>
            </div>
          </div>
          <EmployeeStatusBadge employee={employee} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10.5px]">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[9.5px] text-slate-500">{label}</dt>
              <dd className="truncate font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center justify-between rounded bg-white px-2.5 py-1.5 text-[10.5px]">
          <span className="flex items-center gap-1 text-slate-500">
            <ClipboardListIcon className="size-3 text-[#2563eb]" /> Current Workload:
          </span>
          <span className={cx("font-semibold", overdue ? "text-red-600" : "text-slate-800")}>
            {inProgress} In-Progress Task{inProgress === 1 ? "" : "s"} • {overdue} Overdue
          </span>
        </p>
      </div>

      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
        <ClipboardListIcon className="size-3.5 text-[#2563eb]" /> Quick Assign Task to {firstName}
      </h3>
      <div className="space-y-2.5">
        <FormField label="Task Title" htmlFor="qa-title" error={err.title}>
          <input id="qa-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Short Description & Scope" htmlFor="qa-desc">
          <textarea
            id="qa-desc"
            value={description}
            maxLength={5000}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            className={cx(inputClass, "h-auto resize-none py-2")}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Due Date" htmlFor="qa-due" error={err.dueDate}>
            <input id="qa-due" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Priority Tier">
            <Segmented
              label="Priority tier"
              value={priority}
              onChange={setPriority}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Med" },
                { value: "high", label: "High", activeClass: "bg-red-600 font-semibold text-white" },
              ]}
            />
          </FormField>
        </div>
        <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[9.5px] text-slate-500">
          <InfoIcon className="mt-px size-3 shrink-0" />
          The task appears immediately in {firstName}&apos;s My Tasks list.
        </p>
        <FormMessage error={result.error} message={result.message} />
      </div>
    </Modal>
  );
}
