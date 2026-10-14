import { Suspense } from "react";
import { connection } from "next/server";
import { loadManagerData } from "@/lib/manager/queries";
import { ManagerAnnouncementsView } from "@/components/manager/views/announcements-view";
import { LoadingState } from "@/components/employee/ui";

async function Content() {
  await connection();
  const result = await loadManagerData({ roster: true, announcements: true });
  return <ManagerAnnouncementsView data={result.data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Content />
    </Suspense>
  );
}
