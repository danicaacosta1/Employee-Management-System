import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { getDashboard } from "@/lib/employee/queries";
import { formatDay, todayKey } from "@/lib/employee/format";
import { DashboardView } from "@/components/employee/views/dashboard-view";
import { LoadingState } from "@/components/employee/ui";

async function Dashboard() {
  const user = await requireRole("employee");
  const today = todayKey();
  const result = await getDashboard(today.slice(0, 7));
  return (
    <DashboardView
      firstName={user.firstName}
      todayLabel={formatDay(today, { month: "long", day: "numeric", year: "numeric" })}
      data={result.data}
    />
  );
}

export default function EmployeeDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading dashboard…" />}>
      <Dashboard />
    </Suspense>
  );
}
