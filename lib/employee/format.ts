/** Display + calculation helpers shared by portal views (client and server safe). */

const TZ = "Asia/Manila";

function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit", year: "numeric" }) {
  return parseDay(day).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function formatDayWithWeekday(day: string) {
  return formatDay(day, { weekday: "short", month: "short", day: "2-digit", year: "numeric" });
}

export function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${date} · ${time}`;
}

export function formatIsoDay(iso: string) {
  return formatDay(toDayKey(iso));
}

/** YYYY-MM-DD of an instant in the company timezone. */
export function toDayKey(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function todayKey() {
  return toDayKey(new Date());
}

/** "Today", "Yesterday", "3 days ago" relative to the company calendar day. */
export function relativeDay(iso: string) {
  const diff = -daysUntil(toDayKey(iso));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

/** "5 mins ago", "3 hours ago", then relativeDay(). */
export function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return relativeDay(iso);
}

/** Inclusive date-range overlap of YYYY-MM-DD strings. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)} hrs ${minutes % 60} mins`;
}

/** Monday–Friday count, inclusive. Mirrors public.count_working_days(). */
export function countWorkingDays(start: string, end: string) {
  if (!start || !end) return 0;
  const from = parseDay(start);
  const to = parseDay(end);
  if (to < from) return 0;
  let days = 0;
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** Whole days from today until `day` (negative when past). */
export function daysUntil(day: string) {
  return Math.round((parseDay(day).getTime() - parseDay(todayKey()).getTime()) / 86_400_000);
}

export function monthKey(day: string) {
  return day.slice(0, 7);
}

export function formatMonth(key: string) {
  return parseDay(`${key}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          // Neutralise spreadsheet formula injection.
          const text = String(cell).replace(/^[=+\-@\t\r]/, "'$&");
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
