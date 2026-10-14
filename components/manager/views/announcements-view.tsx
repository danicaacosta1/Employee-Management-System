"use client";
import { useDemoManager } from "@/lib/employee/demo-store";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnnouncementCategory } from "@/lib/employee/types";
import type { DeptAnnouncement, ManagerData } from "@/lib/manager/types";
import { ANNOUNCEMENT_CATEGORY, MANAGER_CATEGORIES } from "@/lib/employee/labels";
import { saveAnnouncement } from "@/lib/manager/actions";
import { formatDateTime } from "@/lib/employee/format";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronUpIcon,
  FileTextIcon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  EmptyState,
  FormMessage,
  Pagination,
  SearchInput,
  buttonClass,
  cx,
  usePaged,
  type IconType,
} from "@/components/employee/ui";
import { AnnouncementModal } from "../announcement-modal";

const ACCENT: Partial<Record<AnnouncementCategory, string>> = {
  sprint_notices: "border-l-[#2563eb]",
  technical_guidelines: "border-l-slate-400",
  team_events: "border-l-emerald-500",
  operational: "border-l-slate-300",
};

function Stat({ label, value, extra, icon: Icon, tile }: { label: string; value: React.ReactNode; extra?: React.ReactNode; icon: IconType; tile: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div>
        <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <p className="text-[15px] font-bold text-slate-900">
          {value}
          {extra && <span className="ml-1 text-[9.5px] font-medium">{extra}</span>}
        </p>
      </div>
      <span className={cx("flex size-7 items-center justify-center rounded-md", tile)}>
        <Icon className="size-3.5" />
      </span>
    </div>
  );
}

type StatusFilter = "all" | "published" | "draft";

export function ManagerAnnouncementsView({ data: initialData }: { data: Pick<ManagerData, "context" | "roster" | "announcements"> }) {
  const data = useDemoManager(initialData);
  const router = useRouter();
  const { context, roster, announcements } = data;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | AnnouncementCategory>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<DeptAnnouncement | "new" | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const published = announcements.filter((a) => a.status === "published");
  const drafts = announcements.filter((a) => a.status === "draft");
  const categories = [...new Set([...MANAGER_CATEGORIES, ...announcements.map((a) => a.category)])];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return announcements.filter(
      (a) =>
        (category === "all" || a.category === category) &&
        (status === "all" || a.status === status) &&
        (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)),
    );
  }, [announcements, query, category, status]);
  const paged = usePaged(filtered, 6, `${query}|${category}|${status}`);

  function publish(a: DeptAnnouncement) {
    const form = new FormData();
    form.set("id", a.id);
    form.set("title", a.title);
    form.set("body", a.body);
    form.set("category", a.category);
    form.set("status", "published");
    setPublishing(a.id);
    startTransition(async () => {
      const res = await saveAnnouncement(form);
      setPublishing(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? Object.values(res.fieldErrors ?? {})[0]);
    });
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const statusChip = (value: StatusFilter, label: string, dot: string) => (
    <button
      type="button"
      onClick={() => setStatus(status === value ? "all" : value)}
      aria-pressed={status === value}
      className={cx(
        "flex h-7 items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold",
        status === value ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-slate-200 text-slate-600 hover:bg-slate-50",
      )}
    >
      <span className={cx("size-1.5 rounded-full", dot)} />
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] leading-7 font-semibold text-slate-900">Department Announcements</h1>
          <p className="text-[11.5px] text-slate-500">Publish engineering team bulletins, sprint notices, and operational guidelines.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className={buttonClass("primary")}>
          <PlusIcon className="size-3.5" /> New Announcement
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-8">
        <Stat label="Total Bulletins" value={announcements.length} icon={MegaphoneIcon} tile="bg-blue-50 text-[#2563eb]" />
        <Stat label="Published" value={published.length} extra={<span className="text-emerald-600">↑active</span>} icon={CheckCircleIcon} tile="bg-emerald-100 text-emerald-600" />
        <Stat label="Drafts" value={drafts.length} icon={FileTextIcon} tile="bg-slate-100 text-slate-500" />
        <Stat
          label="Audience Reach"
          value={<span title="Read tracking is not enabled; showing department size.">—</span>}
          extra={<span className="text-slate-500">{roster.length} members</span>}
          icon={UsersIcon}
          tile="bg-blue-100 text-[#2563eb]"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search department bulletins, keywords..." className="w-full sm:w-[240px]" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cx(
                "h-7 rounded-md px-2.5 text-[10.5px] font-medium",
                category === c ? "bg-[#2563eb] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100",
              )}
            >
              {c === "all" ? "All Categories" : ANNOUNCEMENT_CATEGORY[c]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          {statusChip("published", `Published: ${published.length} Bulletins`, "bg-[#2563eb]")}
          {statusChip("draft", `Drafts: ${drafts.length}`, "bg-slate-400")}
        </div>
      </div>
      <FormMessage error={error} />

      {paged.rows.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} title="No announcements" message="Create a bulletin for your department." />
      ) : (
        <ul className="space-y-3">
          {paged.rows.map((a) => {
            const draft = a.status === "draft";
            const open = expanded.has(a.id);
            return (
              <li
                key={a.id}
                className={cx(
                  "rounded-md border border-slate-200 border-l-[3px] bg-white px-4 py-3",
                  draft ? "border-l-slate-300 bg-slate-50/50" : (ACCENT[a.category] ?? "border-l-[#2563eb]"),
                )}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[9.5px] text-slate-500">
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold tracking-wide text-[#2563eb] uppercase">
                      {ANNOUNCEMENT_CATEGORY[a.category]}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="size-3" />
                      {draft ? `Last edited ${formatDateTime(a.updatedAt)}` : formatDateTime(a.publishedAt)}
                    </span>
                    {a.issuedBy && (
                      <span className="flex items-center gap-1">
                        <UserIcon className="size-3" />
                        {a.issuedBy}
                      </span>
                    )}
                  </div>
                  <span
                    className={cx(
                      "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                      draft ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600",
                    )}
                  >
                    {draft ? "Draft" : "Published"}
                  </span>
                </div>
                <h2 className="text-[12.5px] font-semibold text-slate-900">{a.title}</h2>
                <p className={cx("mt-0.5 max-w-[820px] text-[11px] leading-[16px] whitespace-pre-line text-slate-600", !open && "line-clamp-2")}>
                  {a.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[9.5px] text-slate-500">
                    {draft ? (
                      "Not yet broadcast"
                    ) : a.attachmentName ? (
                      <>
                        <FileTextIcon className="size-3" /> 1 Document ({a.attachmentName})
                      </>
                    ) : (
                      "No attachments"
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {draft ? (
                      <>
                        <button type="button" onClick={() => publish(a)} disabled={publishing === a.id} className={buttonClass("primary", "sm")}>
                          {publishing === a.id ? "Publishing…" : "Publish Now"}
                        </button>
                        <button type="button" onClick={() => setEditing(a)} className={buttonClass("secondary", "sm")}>
                          Continue Editing
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setEditing(a)} className={cx(buttonClass("ghost", "sm"), "font-semibold text-slate-800")}>
                          <PencilIcon className="size-3" /> Edit Announcement
                        </button>
                        <button type="button" onClick={() => toggle(a.id)} aria-expanded={open} className="flex items-center gap-1 text-[10.5px] font-semibold text-[#2563eb] hover:underline">
                          {open ? "Hide Details" : "View Details"}
                          {open ? <ChevronUpIcon className="size-3" /> : <ArrowRightIcon className="size-3" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {paged.pageCount > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} />
        </div>
      )}

      {editing && (
        <AnnouncementModal
          key={editing === "new" ? "new" : editing.id}
          announcement={editing === "new" ? undefined : editing}
          departmentName={context.departmentName}
          teamSize={roster.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
