"use client";
import { handleDialogKey } from "@/lib/ui/dialog-focus";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  SearchIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/ui/icons";
import { initials } from "@/lib/employee/format";

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ buttons */

const BUTTON = {
  primary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-[#2563eb]/60",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  soft: "bg-[#eaf0fe] text-[#2563eb] hover:bg-[#dce6fd]",
  ghost: "text-slate-600 hover:bg-slate-100",
} as const;

export function buttonClass(variant: keyof typeof BUTTON = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed",
    size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3.5 text-[12px]",
    BUTTON[variant],
  );
}

/* ------------------------------------------------------------------- badges */

const TONES = {
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-[#2563eb]",
  amber: "bg-amber-50 text-amber-600",
  gray: "bg-slate-100 text-slate-500",
  indigo: "bg-indigo-50 text-indigo-600",
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-4 font-semibold whitespace-nowrap",
        TONES[tone],
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- page bits */

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase">{eyebrow}</div>}
        <h1 className="text-[20px] leading-7 font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] leading-[18px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {children}
    </div>
  );
}

export function IconTile({ icon: Icon, className }: { icon: IconType; className?: string }) {
  return (
    <span className={cx("flex size-7 items-center justify-center rounded-md", className ?? "bg-blue-50 text-[#2563eb]")}>
      <Icon className="size-3.5" />
    </span>
  );
}

export function EmptyState({ icon: Icon, title, message }: { icon?: IconType; title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-2 size-6 text-slate-300" />}
      <p className="text-[13px] font-semibold text-slate-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[12px] text-slate-500">{message}</p>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-slate-500" role="status">
      <SpinnerIcon className="size-4 animate-spin" />
      {label}
    </div>
  );
}

/** Neutral fallback for sample content. */
export function PendingDatabase({ feature }: { feature: string }) {
  return (
    <Card className="mt-2">
      <EmptyState
        icon={DatabaseIcon}
        title={`Loading ${feature.toLowerCase()} sample data`}
        message="Sample records are loading. Please refresh if they do not appear."
      />
    </Card>
  );
}

/* -------------------------------------------------------------- form inputs */

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 focus-within:border-[#2563eb] focus-within:bg-white",
        className,
      )}
    >
      <SearchIcon className="size-3.5 shrink-0 text-slate-400" />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

export function FilterSelect<T extends string>({
  label,
  prefix,
  icon: Icon,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  prefix?: string;
  icon?: IconType;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label
      className={cx(
        "relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700 focus-within:border-[#2563eb] hover:bg-slate-50",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 text-slate-500" />}
      {prefix && <span className="font-semibold tracking-wide text-slate-400 uppercase">{prefix}</span>}
      <span className="font-semibold">{current}</span>
      <ChevronDownIcon className="size-3 text-slate-500" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FormField({
  label,
  required,
  aside,
  error,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  aside?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] font-semibold text-slate-800">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {aside}
      </div>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export const inputClass =
  "h-8 w-full rounded-md border border-transparent bg-[#eef2f7] px-2.5 text-[12px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#2563eb] focus:bg-white disabled:text-slate-600";

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cx(
        "rounded-md px-3 py-2 text-[11px]",
        error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {error ?? message}
    </p>
  );
}

/* --------------------------------------------------------------------- table */

export type Column<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  headClassName = "bg-slate-100",
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  headClassName?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className={headClassName}>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(
                  "px-3 py-2.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={cx("border-b border-slate-100 last:border-0", rowClassName?.(row))}>
                {columns.map((c) => (
                  <td key={c.key} className={cx("px-3 py-2.5 align-middle text-[12px] text-slate-700", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- pagination */

export function usePaged<T>(items: T[], pageSize: number, resetKey: string) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  // Back to page 1 whenever search/filter inputs change.
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const rows = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );
  return {
    rows,
    page: current,
    pageCount,
    setPage,
    from: items.length ? (current - 1) * pageSize + 1 : 0,
    to: Math.min(current * pageSize, items.length),
    total: items.length,
  };
}

export function Pagination({
  page,
  pageCount,
  onChange,
  labels,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Text buttons ("Prev"/"Next") instead of chevrons. */
  labels?: [string, string];
}) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const nav = "flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] font-medium";
  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={cx(nav, "text-slate-500 hover:bg-slate-100 disabled:opacity-40")}
        aria-label="Previous page"
      >
        {labels ? labels[0] : <ChevronLeftIcon className="size-3" />}
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={cx(nav, p === page ? "bg-[#2563eb] text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className={cx(nav, "text-slate-500 hover:bg-slate-100 disabled:opacity-40")}
        aria-label="Next page"
      >
        {labels ? labels[1] : <ChevronRightIcon className="size-3" />}
      </button>
    </nav>
  );
}

/* --------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  footer,
  children,
  width = "max-w-[440px]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small label above the title. */
  eyebrow?: ReactNode;
  subtitle?: string;
  icon?: IconType;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => handleDialogKey(e, panelRef.current, document.activeElement, onClose);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-[1px]" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.35)] outline-none",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-start gap-2">
            {Icon && <Icon className="mt-0.5 size-3.5 text-[#2563eb]" />}
            <div>
              {eyebrow && <div className="mb-0.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">{eyebrow}</div>}
              <h2 id={titleId} className="text-[13px] font-semibold text-slate-900">
                {title}
              </h2>
              {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XIcon className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- avatars */

export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600",
        className ?? "size-6",
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- slide-over */

/** Right-side review panel (leave approvals). Same overlay treatment as Modal. */
export function SlideOver({
  open,
  onClose,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => handleDialogKey(e, panelRef.current, document.activeElement, onClose);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-[1px]" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col border-l border-slate-200 bg-white shadow-[-12px_0_40px_-12px_rgba(15,23,42,0.3)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">{header}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XIcon className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-slate-50 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex h-6 items-center justify-center gap-1 rounded text-[11px] transition-colors",
              active ? (o.activeClass ?? "border border-slate-200 bg-white font-semibold text-[#2563eb] shadow-sm") : "text-slate-500 hover:text-slate-800",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
