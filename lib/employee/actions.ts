"use client";
import { editDemo, editDemoProfile, DEMO_MESSAGE, DEMO_EMPLOYEE_ID } from "./demo-store";
import { countWorkingDays, todayKey } from "./format";
import { validateConfirm, validateStrongPassword } from "@/lib/auth/validation";
import type { LeaveType, TaskStatus } from "./types";
export type ActionResult = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };
export async function updateTaskProgress(taskId: string, status: TaskStatus, remark: string): Promise<ActionResult> {
 if (remark.length > 1000) return { fieldErrors: { remark: "Use at most 1000 characters." } };
 editDemo({ collection: "tasks", id: taskId, patch: { status, latestRemark: remark.trim() } });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function submitLeaveRequest(form: FormData, types: LeaveType[]): Promise<ActionResult> {
 const type = types.find(t => t.id === form.get("leaveTypeId"));
 const startDate = String(form.get("startDate") ?? "");
 const endDate = String(form.get("endDate") ?? "");
 const reason = String(form.get("reason") ?? "").trim();
 const workingDays = countWorkingDays(startDate, endDate);
 if (!type || !startDate || !endDate || startDate < todayKey() || endDate < startDate || !workingDays || reason.length < 10)
  return { error: "Review the leave type, dates, and reason." };
 const file = form.get("document");
 if (type.requiresDocument && !(file instanceof File && file.size))
  return { fieldErrors: { document: "Attach a supporting document." } };
 const id = crypto.randomUUID();
 editDemo({ collection: "leave", id, created: {
  employeeId: DEMO_EMPLOYEE_ID, employeeName: "Elena Vance", employeeCode: "EMP-2022-8491", employeePosition: "Software Engineer II",
  id, code: `DEMO-${id.slice(0, 6).toUpperCase()}`, typeCode: type.code, typeName: type.name,
  startDate, endDate, workingDays, reason, status: "pending", submittedAt: new Date().toISOString(),
  decidedAt: null, managerRemarks: null, attachmentName: file instanceof File ? file.name : null,
 } as { id: string } });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function updateOwnProfile(form: FormData): Promise<ActionResult> {
 const fullName = String(form.get("fullName") ?? "").trim();
 const phone = String(form.get("phone") ?? "").trim();
 if (fullName.length < 2) return { fieldErrors: { fullName: "Enter your full name." } };
 if (phone && !/^[+\d\s()-]{7,20}$/.test(phone)) return { fieldErrors: { phone: "Enter a valid phone number." } };
 const [firstName, ...last] = fullName.split(/\s+/);
 editDemoProfile({ firstName, lastName: last.join(" "), phone });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function changePassword(form: FormData): Promise<ActionResult> {
 const current = String(form.get("currentPassword") ?? "");
 const next = String(form.get("newPassword") ?? "");
 const confirm = String(form.get("confirmPassword") ?? "");
 const fieldErrors: Record<string, string> = {};
 if (!current) fieldErrors.currentPassword = "Enter your current password.";
 const invalid = validateStrongPassword(next);
 if (invalid) fieldErrors.newPassword = invalid;
 const mismatch = validateConfirm(next, confirm);
 if (mismatch) fieldErrors.confirmPassword = mismatch;
 if (Object.keys(fieldErrors).length) return { fieldErrors };
 return { ok: true, message: "Demo validation complete. Your actual account password was not changed. Use Forgot Password to change it." };
}
