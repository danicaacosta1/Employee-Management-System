import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { buildPreviewData } from "@/lib/employee/preview-data";
import { formatDay, todayKey } from "@/lib/employee/format";
import { LoadingState } from "@/components/employee/ui";
import { AnnouncementsView } from "@/components/employee/views/announcements-view";
import { AttendanceView } from "@/components/employee/views/attendance-view";
import { DashboardView } from "@/components/employee/views/dashboard-view";
import { LeaveView } from "@/components/employee/views/leave-view";
import { ProfileView } from "@/components/employee/views/profile-view";
import { TasksView } from "@/components/employee/views/tasks-view";

const SECTIONS = ["dashboard", "attendance", "tasks", "announcements", "leave", "profile"] as const;

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  await connection();
  const data = buildPreviewData(new Date());
  const today = todayKey();

  switch (section) {
    case "dashboard":
      return (
        <DashboardView
          firstName={data.identity.firstName}
          todayLabel={formatDay(today, { month: "long", day: "numeric", year: "numeric" })}
          data={data.dashboard}
        />
      );
    case "attendance":
      return <AttendanceView records={data.attendance} currentMonth={today.slice(0, 7)} />;
    case "tasks":
      return <TasksView tasks={data.tasks} />;
    case "announcements":
      return <AnnouncementsView announcements={data.announcements} />;
    case "leave":
      return <LeaveView data={data.leave} />;
    case "profile":
      return <ProfileView profile={data.profile} />;
    default:
      notFound();
  }
}

export default function EmployeePreviewPage({ params }: PageProps<"/preview/employee/[section]">) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Section params={params} />
    </Suspense>
  );
}
