import { Suspense } from "react";
import { connection } from "next/server";
import { loadManagerData } from "@/lib/manager/queries";
import { todayKey } from "@/lib/employee/format";
import { ManagerEmployeesView } from "@/components/manager/views/employees-view";
import { LoadingState } from "@/components/employee/ui";

async function Content() {
  await connection();
  const today = todayKey();
  const result = await loadManagerData({ roster: true, tasks: true, leave: true, attendanceFrom: today });
  return <ManagerEmployeesView data={result.data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Content />
    </Suspense>
  );
}
