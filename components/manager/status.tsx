import type { DeptEmployee } from "@/lib/manager/types";
import { EMPLOYMENT_TYPE } from "@/lib/employee/labels";
import { StatusBadge } from "@/components/employee/ui";

/** Employment badge: probation / leave / inactive / "<Type> · Active". */
export function EmployeeStatusBadge({ employee, onLeave }: { employee: DeptEmployee; onLeave?: boolean }) {
  if (employee.employmentStatus === "inactive") return <StatusBadge tone="gray">Inactive</StatusBadge>;
  if (onLeave || employee.employmentStatus === "on_leave") return <StatusBadge tone="blue">On Leave</StatusBadge>;
  if (employee.employmentType === "probationary") return <StatusBadge tone="indigo">Probationary</StatusBadge>;
  return <StatusBadge tone="green">{EMPLOYMENT_TYPE[employee.employmentType] ?? "Employee"} · Active</StatusBadge>;
}
