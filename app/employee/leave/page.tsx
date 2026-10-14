import { Suspense } from "react";
import { getLeaveData } from "@/lib/employee/queries";
import { LeaveView } from "@/components/employee/views/leave-view";
import { LoadingState } from "@/components/employee/ui";

async function Leave() {
  const result = await getLeaveData();
  return <LeaveView data={result.data} />;
}

export default function EmployeeLeavePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading leave requests…" />}>
      <Leave />
    </Suspense>
  );
}
