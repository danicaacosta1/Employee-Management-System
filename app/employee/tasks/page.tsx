import { Suspense } from "react";
import { getTasks } from "@/lib/employee/queries";
import { TasksView } from "@/components/employee/views/tasks-view";
import { LoadingState } from "@/components/employee/ui";

async function Tasks() {
  const result = await getTasks();
  return <TasksView tasks={result.data} />;
}

export default function EmployeeTasksPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading tasks…" />}>
      <Tasks />
    </Suspense>
  );
}
