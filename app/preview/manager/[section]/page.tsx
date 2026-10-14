import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { buildManagerPreviewData } from "@/lib/manager/preview-data";
import { LoadingState } from "@/components/employee/ui";
import { ManagerAnnouncementsView } from "@/components/manager/views/announcements-view";
import { ManagerAttendanceView } from "@/components/manager/views/attendance-view";
import { ManagerDashboardView } from "@/components/manager/views/dashboard-view";
import { ManagerEmployeesView } from "@/components/manager/views/employees-view";
import { ManagerLeaveView } from "@/components/manager/views/leave-view";
import { ManagerTasksView } from "@/components/manager/views/tasks-view";

const SECTIONS = ["dashboard", "employees", "attendance", "tasks", "leave", "announcements"] as const;

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  await connection();
  const data = buildManagerPreviewData(new Date());
  switch (section) {
    case "dashboard":
      return <ManagerDashboardView data={data} />;
    case "employees":
      return <ManagerEmployeesView data={data} />;
    case "attendance":
      return <ManagerAttendanceView data={data} />;
    case "tasks":
      return <ManagerTasksView data={data} />;
    case "leave":
      return <ManagerLeaveView data={data} />;
    case "announcements":
      return <ManagerAnnouncementsView data={data} />;
    default:
      notFound();
  }
}

export default function ManagerPreviewPage({ params }: PageProps<"/preview/manager/[section]">) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Section params={params} />
    </Suspense>
  );
}
