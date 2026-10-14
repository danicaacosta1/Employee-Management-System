"use client";
import { useDemoRows } from "@/lib/employee/demo-store";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Task, TaskPriority, TaskStatus } from "@/lib/employee/types";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/employee/labels";
import { daysUntil, formatDay, formatIsoDay } from "@/lib/employee/format";
import { updateTaskProgress } from "@/lib/employee/actions";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  ClipboardListIcon,
  FlagIcon,
  InfoIcon,
  LayoutGridIcon,
  ListIcon,
  RefreshIcon,
  SlidersIcon,
  SpinnerIcon,
} from "@/components/ui/icons";
import {
  Card,
  DataTable,
  EmptyState,
  FilterSelect,
  FormMessage,
  IconTile,
  InitialsAvatar,
  Modal,
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

function dueState(task: Task) {
  if (task.status === "completed") return null;
  const days = daysUntil(task.dueDate);
  if (days < 0) return { label: "Overdue", urgent: true };
  if (days <= 3) return { label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`, urgent: true };
  return null;
}

function SummaryCard({
  label,
  count,
  icon,
  accent,
  tile,
  note,
}: {
  label: string;
  count: number;
  icon: IconType;
  accent: string;
  tile: string;
  note: ReactNode;
}) {
  return (
    <Card className={cx("border-t-2 px-4 pt-3 pb-3.5", accent)}>
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] text-slate-500">{label}</p>
        <IconTile icon={icon} className={tile} />
      </div>
      <p className="mt-1 text-[22px] leading-7 font-bold text-slate-900">
        {count}
        <span className="ml-1.5 text-[11px] font-medium text-slate-500">Tasks</span>
      </p>
      <div className="mt-3 text-[9.5px] font-medium">{note}</div>
    </Card>
  );
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: IconType }[] = [
  { value: "todo", label: "To Do", icon: CircleIcon },
  { value: "in_progress", label: "In Progress", icon: CircleDotIcon },
  { value: "completed", label: "Completed", icon: CheckCircleIcon },
];

function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [remark, setRemark] = useState(task.latestRemark ?? "");
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const due = dueState(task);
  const changed = status !== task.status || remark !== (task.latestRemark ?? "");

  function save() {
    startTransition(async () => {
      const res = await updateTaskProgress(task.id, status, remark);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setResult({ error: res.error ?? res.fieldErrors?.remark });
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Task Details & Status Update"
      icon={SlidersIcon}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={pending || !changed} className={buttonClass("primary")}>
            {pending ? <SpinnerIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            Save Changes
          </button>
        </>
      }
    >
      <h3 className="mb-3 text-[14px] font-semibold text-slate-900">{task.title}</h3>

      <div className="mb-3 rounded-md bg-slate-50 px-3 py-2.5">
        <p className="mb-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Description</p>
        <p className="text-[11.5px] leading-[17px] whitespace-pre-line text-slate-700">{task.description || "No description provided."}</p>
      </div>

      <dl className="mb-4 space-y-2 border-b border-slate-100 pb-3 text-[11px]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Assigned By</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-slate-800">
            {task.assignedBy ? (
              <>
                <InitialsAvatar name={task.assignedBy.name} className="size-5" />
                {task.assignedBy.name}
                {task.assignedBy.position && ` (${task.assignedBy.position})`}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Assigned Date</dt>
          <dd className="font-medium text-slate-800">{formatIsoDay(task.assignedAt)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Due Date</dt>
          <dd className={cx("font-medium", due ? "text-red-600" : "text-slate-800")}>
            {formatDay(task.dueDate)}
            {due && <span className="ml-1.5 rounded bg-red-50 px-1 py-px text-[9.5px] font-semibold">({due.label})</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Priority Level</dt>
          <dd>
            <StatusBadge tone={TASK_PRIORITY[task.priority].tone}>{TASK_PRIORITY[task.priority].label} Priority</StatusBadge>
          </dd>
        </div>
      </dl>

      <fieldset className="mb-3">
        <legend className="mb-1.5 text-[11px] font-semibold text-slate-800">Update Current Status</legend>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-50 p-1">
          {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cx(
                "flex cursor-pointer flex-col items-center gap-0.5 rounded px-2 py-1.5 text-[11px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#2563eb]",
                status === value ? "border border-slate-200 bg-white font-semibold text-[#2563eb] shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <input type="radio" name="status" value={value} checked={status === value} onChange={() => setStatus(value)} className="sr-only" />
              <Icon className="size-3" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="task-remark" className="text-[11px] font-semibold text-slate-800">
            Progress Remark &amp; Notes
          </label>
          <span className="text-[9.5px] text-slate-400">Visible to manager</span>
        </div>
        <textarea
          id="task-remark"
          value={remark}
          maxLength={1000}
          onChange={(e) => setRemark(e.target.value)}
          rows={3}
          placeholder="Describe your progress..."
          className="w-full resize-none rounded-md border border-transparent bg-[#eef2f7] px-2.5 py-2 text-[11.5px] text-slate-800 outline-none focus:border-[#2563eb] focus:bg-white"
        />
      </div>

      <p className="mb-2 flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[9.5px] text-slate-500">
        <InfoIcon className="mt-px size-3 shrink-0" />
        {task.assignedBy
          ? `Changing status to Completed will notify ${task.assignedBy.name} for review.`
          : "Changing status to Completed will notify your manager for review."}
      </p>
      <FormMessage error={result.error} message={result.message} />
    </Modal>
  );
}

type StatusFilter = "all" | TaskStatus;
type PriorityFilter = "all" | TaskPriority;

export function TasksView({ tasks: initialRows }: { tasks: Task[] }) {
  const tasks = useDemoRows("tasks", initialRows);
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(params.get("task"));

  // Keep ?task= deep links in sync with the modal.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("task", openId);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  }, [openId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (status === "all" || t.status === status) &&
        (priority === "all" || t.priority === priority) &&
        (!q || [t.title, t.description ?? "", t.code, t.project ?? ""].some((v) => v.toLowerCase().includes(q))),
    );
  }, [tasks, query, status, priority]);

  const paged = usePaged(filtered, 5, `${query}|${status}|${priority}`);
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");
  const urgentTodo = todo.filter((t) => t.priority === "high").length;

  const pageIds = paged.rows.map((t) => t.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const actionButton = (t: Task) =>
    t.status === "in_progress" ? (
      <button type="button" onClick={() => setOpenId(t.id)} className={buttonClass("primary", "sm")}>
        Active <ChevronRightIcon className="size-3" />
      </button>
    ) : (
      <button type="button" onClick={() => setOpenId(t.id)} className={cx(buttonClass("soft", "sm"), "h-auto py-1 leading-tight")}>
        View / Update
      </button>
    );

  const columns: Column<Task>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="Select all tasks on this page"
          checked={allOnPage}
          onChange={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              pageIds.forEach((id) => (allOnPage ? next.delete(id) : next.add(id)));
              return next;
            })
          }
          className="size-3.5 accent-[#2563eb]"
        />
      ),
      className: "w-10 pl-4",
      render: (t) => (
        <input
          type="checkbox"
          aria-label={`Select ${t.title}`}
          checked={selected.has(t.id)}
          onChange={() => toggle(t.id)}
          className="size-3.5 accent-[#2563eb]"
        />
      ),
    },
    {
      key: "name",
      header: "Task Name",
      className: "min-w-[180px]",
      render: (t) => (
        <div className="flex gap-2">
          <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", t.status === "completed" ? "bg-emerald-500" : "bg-[#2563eb]")} />
          <div>
            <p className={cx("text-[11.5px] leading-4 font-semibold text-slate-900", t.status === "completed" && "text-slate-500 line-through")}>{t.title}</p>
            <p className="mt-0.5 text-[9.5px] font-medium text-slate-400">
              {t.code}
              {t.project && ` • ${t.project}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "desc",
      header: "Description",
      className: "max-w-[230px]",
      render: (t) => <p className="line-clamp-2 text-[10.5px] leading-[15px] text-slate-500">{t.description}</p>,
    },
    {
      key: "by",
      header: "Assigned By",
      render: (t) =>
        t.assignedBy ? (
          <div className="flex items-center gap-1.5">
            <InitialsAvatar name={t.assignedBy.name} />
            <div className="leading-tight">
              <p className="text-[11px] font-semibold whitespace-nowrap text-slate-800">{t.assignedBy.name}</p>
              {t.assignedBy.position && <p className="text-[9.5px] text-slate-400">{t.assignedBy.position}</p>}
            </div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "due",
      header: "Due Date",
      render: (t) => {
        const due = dueState(t);
        return (
          <span className={cx("flex items-center gap-1 text-[11px] whitespace-nowrap", due ? "font-semibold text-red-600" : "text-slate-700")}>
            {due && <FlagIcon className="size-3" />}
            {formatDay(t.dueDate)}
          </span>
        );
      },
    },
    {
      key: "priority",
      header: "Priority",
      render: (t) => <StatusBadge tone={TASK_PRIORITY[t.priority].tone}>{TASK_PRIORITY[t.priority].label}</StatusBadge>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</StatusBadge>,
    },
    { key: "action", header: "Action", className: "pr-4", render: actionButton },
  ];

  return (
    <div className="mx-auto max-w-[1220px]">
      <PageHeader
        eyebrow={
          <>
            <span className="text-slate-500">Sprint Execution</span>
            <span className="ml-1.5 text-[#2563eb] normal-case">• {inProgress.length} active</span>
          </>
        }
        title="My Assigned Tasks"
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="To Do"
          count={todo.length}
          icon={ClipboardListIcon}
          accent="border-t-slate-300"
          tile="bg-slate-100 text-slate-600"
          note={
            <span className={cx("flex items-center gap-1", urgentTodo ? "text-red-600" : "text-slate-500")}>
              <FlagIcon className="size-3" />
              {urgentTodo ? `${urgentTodo} priority item${urgentTodo === 1 ? "" : "s"} require${urgentTodo === 1 ? "s" : ""} review` : "No high-priority items waiting"}
            </span>
          }
        />
        <SummaryCard
          label="In Progress"
          count={inProgress.length}
          icon={RefreshIcon}
          accent="border-t-[#2563eb]"
          tile="bg-blue-50 text-[#2563eb]"
          note={
            <span className="flex items-center gap-1 text-[#2563eb]">
              <span className="size-1.5 rounded-full bg-current" />
              {inProgress[0] ? `Actively working (${inProgress[0].title})` : "Nothing in progress"}
            </span>
          }
        />
        <SummaryCard
          label="Completed"
          count={completed.length}
          icon={CheckCircleIcon}
          accent="border-t-emerald-500"
          tile="bg-emerald-50 text-emerald-600"
          note={
            <span className="flex items-center gap-1 text-slate-500">
              <ArchiveIcon className="size-3" />
              Completed tasks on record
            </span>
          }
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tasks..." className="w-full sm:w-[450px]" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect<StatusFilter>
            label="Status"
            prefix="Status:"
            value={status}
            onChange={setStatus}
            className="border-transparent bg-slate-50"
            options={[
              { value: "all", label: "All Statuses" },
              ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <FilterSelect<PriorityFilter>
            label="Priority"
            prefix="Priority:"
            value={priority}
            onChange={setPriority}
            className="border-transparent bg-slate-50"
            options={[
              { value: "all", label: "All Priorities" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
          <div className="flex items-center gap-0.5" role="group" aria-label="View">
            {(
              [
                ["list", ListIcon],
                ["grid", LayoutGridIcon],
              ] as const
            ).map(([mode, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                aria-label={`${mode} view`}
                className={cx("rounded p-1.5", view === mode ? "bg-slate-200 text-slate-800" : "text-slate-400 hover:bg-slate-100")}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "list" ? (
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(t) => t.id}
          headClassName="bg-[#eef3fe]"
          rowClassName={(t) => (selected.has(t.id) ? "bg-blue-50/40" : undefined)}
          empty={<EmptyState icon={ClipboardListIcon} title="No tasks found" message="No assigned tasks match your search or filters." />}
        />
      ) : paged.rows.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardListIcon} title="No tasks found" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paged.rows.map((t) => (
            <Card key={t.id} className="flex flex-col gap-2 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-medium text-slate-400">{t.code}</span>
                <StatusBadge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</StatusBadge>
              </div>
              <p className="text-[12px] font-semibold text-slate-900">{t.title}</p>
              <p className="line-clamp-2 text-[10.5px] text-slate-500">{t.description}</p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className={cx("text-[10.5px]", dueState(t) ? "font-semibold text-red-600" : "text-slate-500")}>
                  {dueState(t) && <AlertTriangleIcon className="mr-1 inline size-3" />}Due {formatDay(t.dueDate)}
                </span>
                {actionButton(t)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
        <p className="text-[10.5px] text-slate-500">
          Showing {paged.from} - {paged.to} of {paged.total} assigned records
          {selected.size > 0 && (
            <span className="ml-1 font-semibold text-[#2563eb]">
              • {selected.size} selection{selected.size === 1 ? "" : "s"} inspected
            </span>
          )}
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} labels={["Prev", "Next"]} />
      </div>

      {openTask && <TaskModal key={openTask.id} task={openTask} onClose={() => setOpenId(null)} />}
    </div>
  );
}
