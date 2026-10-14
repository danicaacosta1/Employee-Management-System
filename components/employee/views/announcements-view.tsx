"use client";
import { useDemoRows } from "@/lib/employee/demo-store";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Announcement, AnnouncementCategory } from "@/lib/employee/types";
import { ANNOUNCEMENT_CATEGORY, EMPLOYEE_CATEGORIES } from "@/lib/employee/labels";
import { formatDateTime } from "@/lib/employee/format";
import {
  BuildingIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  MegaphoneIcon,
  ShieldIcon,
  StarIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { EmptyState, FilterSelect, PageHeader, Pagination, SearchInput, cx, usePaged, type IconType } from "../ui";

const CATEGORY_ICON: Partial<Record<AnnouncementCategory, IconType>> = {
  hr_benefits: UsersIcon,
  it_security: ShieldIcon,
  company_news: StarIcon,
  facilities: BuildingIcon,
};

type CategoryFilter = "all" | AnnouncementCategory;
type Sort = "newest" | "oldest";

export function AnnouncementsView({ announcements: initialRows }: { announcements: Announcement[] }) {
  const announcements = useDemoRows("announcements", initialRows);
  const params = useSearchParams();
  const deepLink = params.get("open");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([deepLink ?? announcements[0]?.id].filter((id): id is string => !!id)),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = announcements.filter(
      (a) =>
        (category === "all" || a.category === category) &&
        (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || (a.tag ?? "").toLowerCase().includes(q)),
    );
    return list.sort((a, b) =>
      sort === "newest" ? b.publishedAt.localeCompare(a.publishedAt) : a.publishedAt.localeCompare(b.publishedAt),
    );
  }, [announcements, query, category, sort]);

  const paged = usePaged(filtered, 5, `${query}|${category}|${sort}`);
  const { setPage } = paged;

  // Deep link (?open=<id>): jump to its page and scroll it into view once.
  useEffect(() => {
    if (!deepLink) return;
    const index = filtered.findIndex((a) => a.id === deepLink);
    if (index >= 0) setPage(Math.floor(index / 5) + 1);
    requestAnimationFrame(() => document.getElementById(`announcement-${deepLink}`)?.scrollIntoView({ block: "center" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chips: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: "All" },
    ...[...new Set([...EMPLOYEE_CATEGORIES, ...announcements.map((a) => a.category)])].map((c) => ({
      value: c,
      label: ANNOUNCEMENT_CATEGORY[c],
    })),
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Announcements" subtitle="Official company news, policy updates, and employee notices." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search announcements, keywords..." className="w-full sm:w-[310px]" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
            {chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setCategory(chip.value)}
                aria-pressed={category === chip.value}
                className={cx(
                  "h-8 rounded-md px-3 text-[11px] font-medium",
                  category === chip.value ? "bg-[#2563eb] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        <FilterSelect<Sort>
          label="Sort by"
          prefix="Sort by:"
          value={sort}
          onChange={setSort}
          className="border-transparent"
          options={[
            { value: "newest", label: "Most Recent" },
            { value: "oldest", label: "Oldest First" },
          ]}
        />
      </div>

      {paged.rows.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} title="No announcements found" message="Try a different keyword or category." />
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {paged.rows.map((a) => {
            const open = expanded.has(a.id);
            const Icon = CATEGORY_ICON[a.category] ?? MegaphoneIcon;
            return (
              <li key={a.id} id={`announcement-${a.id}`} className="py-5">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9.5px] font-semibold text-[#2563eb]">
                      <span className="size-1.5 rounded-full bg-current" />
                      {ANNOUNCEMENT_CATEGORY[a.category]}
                    </span>
                    {a.tag && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9.5px] font-semibold text-red-600">{a.tag}</span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <ClockIcon className="size-3" />
                    {formatDateTime(a.publishedAt)}
                  </span>
                </div>
                <h2 className="text-[14px] font-semibold text-slate-900">{a.title}</h2>
                <p className={cx("mt-1 max-w-[760px] text-[11.5px] leading-[18px] whitespace-pre-line text-slate-600", !open && "line-clamp-2")}>
                  {a.body}
                </p>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Icon className="size-3" />
                    {a.issuedBy ?? "Company Announcement"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    aria-expanded={open}
                    className="flex items-center gap-1 text-[10.5px] font-semibold text-[#2563eb] hover:underline"
                  >
                    {open ? "Collapse Details" : "View Details"}
                    {open ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] text-slate-500">
          Showing {paged.rows.length} of {paged.total} records
        </p>
        <Pagination page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage} />
      </div>
    </div>
  );
}
