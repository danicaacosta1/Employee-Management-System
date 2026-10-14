import { Suspense } from "react";
import { connection } from "next/server";
import { loadManagerData } from "@/lib/manager/queries";
import { ManagerLeaveView } from "@/components/manager/views/leave-view";
import { LoadingState } from "@/components/employee/ui";

async function Content() {
  await connection();
  const result = await loadManagerData({ roster: true, tasks: true, leave: true });
  return <ManagerLeaveView data={result.data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Content />
    </Suspense>
  );
}
