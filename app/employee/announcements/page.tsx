import { Suspense } from "react";
import { getAnnouncements } from "@/lib/employee/queries";
import { AnnouncementsView } from "@/components/employee/views/announcements-view";
import { LoadingState } from "@/components/employee/ui";

async function Announcements() {
  const result = await getAnnouncements();
  return <AnnouncementsView announcements={result.data} />;
}

export default function EmployeeAnnouncementsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading announcements…" />}>
      <Announcements />
    </Suspense>
  );
}
