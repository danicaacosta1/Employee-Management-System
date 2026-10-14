import { Suspense } from "react";
import { connection } from "next/server";
import { loadManagerData, shiftDay } from "@/lib/manager/queries";
import { todayKey } from "@/lib/employee/format";
import { ManagerAttendanceView } from "@/components/manager/views/attendance-view";
import { LoadingState } from "@/components/employee/ui";

async function Content() {
  await connection();
  const today = todayKey();
  const result = await loadManagerData({ roster: true, attendanceFrom: shiftDay(today, -60) });
  return <ManagerAttendanceView data={result.data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Content />
    </Suspense>
  );
}
