"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@/lib/employee/types";
import type { DeptEmployee, DeptTask } from "@/lib/manager/types";
import { createTask, updateTask } from "@/lib/manager/actions";
import { nextTaskCode } from "@/lib/manager/insights";
import { todayKey } from "@/lib/employee/format";
import { CheckIcon, CircleDotIcon, SpinnerIcon } from "@/components/ui/icons";
import { FormField, FormMessage, Modal, Segmented, buttonClass, cx, inputClass } from "@/components/employee/ui";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; activeClass?: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "● High", activeClass: "border border-red-200 bg-red-50 font-semibold text-red-600" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

type Tab = "new" | "update";
type Result = { error?: string; message?: string; fieldErrors?: Record<string, string> };

export function TaskModal({
  tasks,
  roster,
  deptCode,
  initialTab = "new",
  initialTaskId,
  presetAssigneeId,
  onClose,
}: {
  tasks: DeptTask[];
  roster: DeptEmployee[];
  deptCode: string;
  initialTab?: Tab;
  initialTaskId?: string;
  presetAssigneeId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [result, setResult] = useState<Result>({});
  const [pending, startTransition] = useTransition();
  const today = todayKey();
  const nextCode = useMemo(() => nextTaskCode(tasks, deptCode || "TSK"), [tasks, deptCode]);
  const assignable = roster.filter((p) => p.role === "employee" && p.employmentStatus === "active");

  // New task form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(
    presetAssigneeId ? (assignable.some((p) => p.id === presetAssigneeId) ? presetAssigneeId : "") : (assignable[0]?.id ?? ""),
  );
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [initialStatus, setInitialStatus] = useState<TaskStatus>("todo");

  // Update form
  const [taskId, setTaskId] = useState(initialTaskId ?? tasks[0]?.id ?? "");
  const task = tasks.find((t) => t.id === taskId);
  const [uStatus, setUStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [uPriority, setUPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [uDue, setUDue] = useState(task?.dueDate ?? "");
  const [remark, setRemark] = useState(task?.latestRemark ?? "");

  function selectTask(id: string) {
    const next = tasks.find((t) => t.id === id);
    setTaskId(id);
    setUStatus(next?.status ?? "todo");
    setUPriority(next?.priority ?? "medium");
    setUDue(next?.dueDate ?? "");
    setRemark(next?.latestRemark ?? "");
    setResult({});
  }

  function submit() {
    if (tab === "new") {
      const fieldErrors: Record<string, string> = {};
      if (title.trim().length < 3) fieldErrors.title = "Use at least 3 characters.";
      if (!assignable.some((p) => p.id === assigneeId)) fieldErrors.assigneeId = "Select an active employee.";
      if (!dueDate) fieldErrors.dueDate = "Select a due date.";
      else if (dueDate < today) fieldErrors.dueDate = "Due date can't be in the past.";
      if (Object.keys(fieldErrors).length) return setResult({ fieldErrors });
    } else if (!task) {
      return setResult({ error: "Select a task to update." });
    } else if (!uDue) {
      return setResult({ fieldErrors: { dueDate: "Select a due date." } });
    }

    startTransition(async () => {
      const res =
        tab === "new"
          ? await createTask({ assigneeId, title, description, dueDate, priority, status: initialStatus }, roster)
          : await updateTask({ taskId, status: uStatus, priority: uPriority, dueDate: uDue, remark });
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
      eyebrow={
        <>
          Sprint Item Config <span className="text-slate-300">/</span>{" "}
          <span className="text-[#2563eb]">{tab === "new" ? nextCode : (task?.code ?? "—")}</span>
        </>
      }
      title={tab === "new" ? "Create & Assign New Task" : "Review & Update Task"}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={pending} className={buttonClass("primary")}>
            {pending ? <SpinnerIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            {tab === "new" ? "Create & Assign Task" : "Save Update"}
          </button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1" role="tablist">
        {(
          [
            ["new", "New Task"],
            ["update", "Update Progress"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setResult({});
            }}
            disabled={value === "update" && tasks.length === 0}
            className={cx(
              "h-7 rounded text-[11px] font-medium disabled:opacity-40",
              tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        <div className="space-y-2.5">
          <FormField label="Task Identifier (Auto-generated)">
            <input value={nextCode} readOnly className={cx(inputClass, "text-slate-500")} aria-readonly />
          </FormField>
          <FormField label="Task Title" htmlFor="task-title" error={err.title}>
            <input id="task-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build audit log exporter" className={inputClass} />
          </FormField>
          <FormField label="Description" htmlFor="task-desc" error={err.description}>
            <textarea
              id="task-desc"
              value={description}
              maxLength={5000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, acceptance criteria, links..."
              className={cx(inputClass, "h-auto resize-none py-2")}
            />
          </FormField>
          <FormField label="Assign To Employee" htmlFor="task-assignee" error={err.assigneeId}>
            <select id="task-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass}>
              <option value="">Select an employee</option>
              {assignable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.position ? ` (${p.position})` : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Due Date" htmlFor="task-due" error={err.dueDate}>
            <input id="task-due" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Priority Level">
            <Segmented label="Priority level" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          </FormField>
          <FormField label="Initial Status">
            <Segmented
              label="Initial status"
              value={initialStatus}
              onChange={setInitialStatus}
              options={[
                { value: "todo", label: <><CircleDotIcon className="size-3" /> To Do</> },
                { value: "in_progress", label: "In Progress" },
              ]}
            />
          </FormField>
        </div>
      ) : (
        <div className="space-y-2.5">
          <FormField label="Task" htmlFor="update-task">
            <select id="update-task" value={taskId} onChange={(e) => selectTask(e.target.value)} className={inputClass}>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.title}
                </option>
              ))}
            </select>
          </FormField>
          {task && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-[11px]">
              <p className="text-slate-500">
                Assigned to <span className="font-semibold text-slate-800">{task.assigneeName}</span>
              </p>
              <p className="mt-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Latest progress note</p>
              <p className="text-slate-700">{task.latestRemark ?? "No progress notes yet."}</p>
            </div>
          )}
          <FormField label="Status">
            <Segmented label="Status" value={uStatus} onChange={setUStatus} options={STATUS_OPTIONS} />
          </FormField>
          <FormField label="Priority Level">
            <Segmented label="Priority level" value={uPriority} onChange={setUPriority} options={PRIORITY_OPTIONS} />
          </FormField>
          <FormField label="Due Date" htmlFor="update-due" error={err.dueDate}>
            <input id="update-due" type="date" value={uDue} onChange={(e) => setUDue(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Manager Remark" aside={<span className="text-[9.5px] text-slate-400">Visible to assignee</span>} htmlFor="update-remark" error={err.remark}>
            <textarea
              id="update-remark"
              value={remark}
              maxLength={1000}
              rows={2}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Review feedback or next steps..."
              className={cx(inputClass, "h-auto resize-none py-2")}
            />
          </FormField>
        </div>
      )}
      <div className="mt-3">
        <FormMessage error={result.error} message={result.message} />
      </div>
    </Modal>
  );
}
