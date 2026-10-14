"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@/lib/employee/types";
import type { DeptTask, ManagerData } from "@/lib/manager/types";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/employee/labels";
import { archiveTask } from "@/lib/manager/actions";
import { daysUntil, formatDay } from "@/lib/employee/format";
import { CheckCircleIcon, CircleIcon, ClipboardListIcon, FilterIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import {
  DataTable,
  EmptyState,
  FilterSelect,
  InitialsAvatar,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  buttonClass,
  cx,
  usePaged,
  type Column,
  type IconType,
} from "@/components/employee/ui";
import { TaskModal } from "../task-modal";

function SummaryCard({
  label,
  count,
  share,
  note,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  share: number;
  note: string;
  icon: IconType;
  color: { text: string; bar: string; chip: string };
}) {
  return (
    <div className="rounded-lg border-[1.5px] border-slate-700 bg-white px-3.5 pt-3 pb-3">
      <div className="flex items-start justify-between">
        <p className={cx("text-[9.5px] font-semibold tracking-wider uppercase", color.text)}>{label}</p>
        <Icon className={cx("size-3.5", color.text)} />
      </div>
      <p className="mt-1 flex items-center gap-2 text-[18px] leading-6 font-bold text-slate-900">
        {count} Tasks
        <span className={cx("rounded px-1.5 py-px text-[9px] font-semibold", color.chip)}>{share}% total</span>
      </p>
      <p className="mt-0.5 text-[9.5px] text-slate-500">{note}</p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full", color.bar)} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function dueNote(t: DeptTask) {
  if (t.status === "completed") return { text: "Completed", className: "text-emerald-600" };
  const d = daysUntil(t.dueDate);
  if (d < 0) return { text: `Overdue ${-d} day${d === -1 ? "" : "s"}`, className: "text-red-600" };
  if (d === 0) return { text: "Due today", className: "text-red-600" };
  return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, className: d <= 3 ? "text-red-600" : "text-slate-400" };
}

const KEY_COLOR: Record<TaskPriority, string> = { high: "text-red-600", medium: "text-[#2563eb]", low: "text-slate-500" };

function RowMenu({ task, onUpdate }: { task: DeptTask; onUpdate: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function archive() {
    if (!window.confirm(`Archive ${task.code}? It will be hidden from both portals.`)) return;
    startTransition(async () => {
      const res = await archiveTask(task.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`More actions for ${task.code}`} aria-expanded={open} className="rounded px-1 text-slate-500 hover:bg-slate-100">
        ⋮
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 text-[11px] shadow-lg">
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onUpdate(); }} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
            Update progress
          </button>
          <button role="menuitem" type="button" onClick={archive} disabled={pending} className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50">
            {pending ? "Archiving…" : "Archive task"}
          </button>
          {error && <p className="px-3 py-1 text-[10px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

type StatusFilter = "all" | TaskStatus;
type PriorityFilter = "all" | TaskPriority;

export function ManagerTasksView({ data: initialData }: { data: Pick<ManagerData, "context" | "roster" | "tasks"> }) {
  const data = useDemoManager(initialData);
  const { context, roster, tasks } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [assignee, setAssignee] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ tab: "new" | "update"; taskId?: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (status === "all" || t.status === status) &&
        (priority === "all" || t.priority === priority) &&
        (assignee === "all" || t.assigneeId === assignee) &&
        (!q || [t.title, t.code, t.assigneeName].some((v) => v.toLowerCase().includes(q))),
    );
  }, [tasks, query, status, priority, assignee]);
  const paged = usePaged(filtered, 5, `${query}|${status}|${priority}|${assignee}`);

  const total = tasks.length || 1;
  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");
  const pct = (n: number) => Math.round((n / total) * 100);
  const dueSoon = (list: DeptTask[]) => list.filter((t) => daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length;
  const filtersActive = query || status !== "all" || priority !== "all" || assignee !== "all";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageIds = paged.rows.map((t) => t.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const columns: Column<DeptTask>[] = [
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
      className: "w-10 pl-14",
      render: (t) => (
        <input type="checkbox" aria-label={`Select ${t.code}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="size-3.5 accent-[#2563eb]" />
      ),
    },
    {
      key: "title",
      header: "Task Title & Key",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className={cx("text-[11px] font-semibold whitespace-nowrap", KEY_COLOR[t.priority])}>{t.code}</span>
          <span className={cx("max-w-[180px] text-[11px] leading-4 font-semibold text-slate-900", t.status === "completed" && "text-slate-500")}>{t.title}</span>
        </div>
      ),
    },
    {
      key: "assignee",
      header: "Assigned To",
      render: (t) => (
        <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-slate-800">
          <InitialsAvatar name={t.assigneeName} className="size-6" />
          {t.assigneeName}
        </span>
      ),
    },
    {
      key: "due",
      header: "Due Date",
      render: (t) => {
        const note = dueNote(t);
        return (
          <div className="leading-tight">
            <p className="text-[10.5px] whitespace-nowrap text-slate-700">{formatDay(t.dueDate)}</p>
            <p className={cx("text-[9.5px] font-medium", note.className)}>{note.text}</p>
          </div>
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
      render: (t) =>
        t.status === "in_progress" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="size-1.5 rounded-full bg-white" /> In Progress
          </span>
        ) : (
          <StatusBadge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (t) => (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setModal({ tab: "update", taskId: t.id })} className={cx(buttonClass("soft", "sm"), "h-auto py-1 leading-tight")}>
            View / Update
          </button>
          <RowMenu task={t} onUpdate={() => setModal({ tab: "update", taskId: t.id })} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Department Tasks"
        subtitle={<span className="block max-w-[220px]">Manage sprint backlog, assign deliverables to team members, and track execution.</span>}
        actions={
          <button type="button" onClick={() => setModal({ tab: "new" })} disabled={!roster.length} className={buttonClass("primary")}>
            <PlusIcon className="size-3.5" /> New Task
          </button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="To Do"
          count={todo.length}
          share={pct(todo.length)}
          note={`${dueSoon(todo)} due within 7 days / awaiting kickoff`}
          icon={CircleIcon}
          color={{ text: "text-slate-500", bar: "bg-slate-500", chip: "bg-slate-100 text-slate-600" }}
        />
        <SummaryCard
          label="In Progress"
          count={inProgress.length}
          share={pct(inProgress.length)}
          note={`${inProgress.filter((t) => t.priority === "high").length} priority items • ${dueSoon(inProgress)} due this week`}
          icon={RefreshIcon}
          color={{ text: "text-[#2563eb]", bar: "bg-[#2563eb]", chip: "bg-blue-50 text-[#2563eb]" }}
        />
        <SummaryCard
          label="Completed"
          count={completed.length}
          share={pct(completed.length)}
          note="Completed and awaiting archive"
          icon={CheckCircleIcon}
          color={{ text: "text-emerald-600", bar: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-600" }}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by task title, key, or assignee..." className="w-full sm:w-[310px]" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect<StatusFilter>
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "all", label: "All Statuses" }, ...(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => ({ value: s, label: TASK_STATUS[s].label }))]}
          />
          <FilterSelect<PriorityFilter>
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[{ value: "all", label: "All Priorities" }, ...(["high", "medium", "low"] as const).map((p) => ({ value: p, label: TASK_PRIORITY[p].label }))]}
          />
          <FilterSelect
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            options={[{ value: "all", label: "All Assignees" }, ...roster.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setPriority("all");
              setAssignee("all");
            }}
            disabled={!filtersActive}
            aria-label="Clear filters"
            title="Clear filters"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <FilterIcon className="size-3.5" />
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(t) => t.id}
        headClassName="bg-slate-50"
        rowClassName={(t) => (selected.has(t.id) ? "bg-blue-50/40" : undefined)}
        empty={<EmptyState icon={ClipboardListIcon} title="No tasks found" message="Create a task or adjust the filters." />}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500">
          Showing {paged.from} to {paged.to} of {paged.total} sprint items
          {selected.size > 0 && <span className="ml-1 font-semibold text-[#2563eb]">• {selected.size} selected</span>}
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} labels={["Previous", "Next"]} />
      </div>

      {modal && (
        <TaskModal
          key={`${modal.tab}-${modal.taskId ?? "new"}`}
          tasks={tasks}
          roster={roster}
          deptCode={context.departmentCode}
          initialTab={modal.tab}
          initialTaskId={modal.taskId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
