import { Suspense } from "react";
import { connection } from "next/server";
import { getAttendance } from "@/lib/employee/queries";
import { todayKey } from "@/lib/employee/format";
import { AttendanceView } from "@/components/employee/views/attendance-view";
import { LoadingState } from "@/components/employee/ui";

/** First month of the 12-month window offered in the month selector. */
function windowStart(current: string) {
  const [y, m] = current.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 12, 1));
  return d.toISOString().slice(0, 7);
}

async function Attendance() {
  await connection();
  const currentMonth = todayKey().slice(0, 7);
  const result = await getAttendance(windowStart(currentMonth));
  return <AttendanceView records={result.data} currentMonth={currentMonth} />;
}

export default function EmployeeAttendancePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading attendance…" />}>
      <Attendance />
    </Suspense>
  );
}
