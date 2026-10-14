import { Suspense } from "react";
import { getProfile } from "@/lib/employee/queries";
import { ProfileView } from "@/components/employee/views/profile-view";
import { LoadingState } from "@/components/employee/ui";

async function Profile() {
  const result = await getProfile();
  return <ProfileView profile={result.data} />;
}

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading profile…" />}>
      <Profile />
    </Suspense>
  );
}
