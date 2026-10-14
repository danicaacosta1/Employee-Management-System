"use client";

import { EmptyState, buttonClass } from "@/components/employee/ui";
import { AlertTriangleIcon } from "@/components/ui/icons";

export default function EmployeePortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <EmptyState icon={AlertTriangleIcon} title="Something went wrong" message="We couldn't load this page. Please try again." />
      <button type="button" onClick={reset} className={buttonClass("primary")}>
        Retry
      </button>
    </div>
  );
}
