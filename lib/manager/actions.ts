"use client";
import type { ActionResult } from "@/lib/employee/actions";
import type { AnnouncementCategory, TaskPriority, TaskStatus } from "@/lib/employee/types";
import { editDemo, DEMO_MESSAGE } from "@/lib/employee/demo-store";
import type { DeptEmployee, DeptAnnouncement } from "./types";
export type TaskInput = { assigneeId: string; title: string; description: string; dueDate: string; priority: TaskPriority; status: TaskStatus };
export async function createTask(input: TaskInput, roster: DeptEmployee[] = []): Promise<ActionResult> {
 if (input.title.trim().length < 3 || !input.assigneeId || !input.dueDate) return { error: "Complete the task details." };
 const assignee = roster.find(p => p.id === input.assigneeId && p.role === "employee" && p.employmentStatus === "active");
 if (!assignee) return { fieldErrors: { assigneeId: "Select an active employee." } };
 const id = crypto.randomUUID();
 editDemo({ collection: "tasks", id, created: {
  ...input, id, code: `DEMO-${id.slice(0, 6).toUpperCase()}`, project: null,
  assignedBy: { name: "Department Manager", position: "Manager" }, assignedAt: new Date().toISOString(),
  latestRemark: null, assigneeName: assignee.name,
 } as { id: string } });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function updateTask(input: { taskId: string; status: TaskStatus; priority: TaskPriority; dueDate: string; remark: string }): Promise<ActionResult> {
 if (!input.dueDate) return { fieldErrors: { dueDate: "Select a due date." } };
 if (input.remark.length > 1000) return { fieldErrors: { remark: "Use at most 1000 characters." } };
 editDemo({ collection: "tasks", id: input.taskId, patch: { status: input.status, priority: input.priority, dueDate: input.dueDate, latestRemark: input.remark } });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function archiveTask(taskId: string): Promise<ActionResult> {
 editDemo({ collection: "tasks", id: taskId, removed: true }); return { ok: true, message: DEMO_MESSAGE };
}
export async function decideLeave(requestId: string, decision: "approved" | "rejected", remarks = ""): Promise<ActionResult> {
 if (decision === "rejected" && !remarks.trim()) return { fieldErrors: { remarks: "Add remarks to reject this request." } };
 if (remarks.length > 1000) return { fieldErrors: { remarks: "Use at most 1000 characters." } };
 editDemo({ collection: "leave", id: requestId, patch: { status: decision, managerRemarks: remarks, decidedAt: new Date().toISOString() } });
 return { ok: true, message: DEMO_MESSAGE };
}
export async function getLeaveAttachmentUrl(requestId: string): Promise<{ url?: string; error?: string }> {
 return { error: `Demo attachment for ${requestId}: sample files are not stored or uploaded.` };
}
export async function saveAnnouncement(form: FormData, existingRecord?: DeptAnnouncement): Promise<ActionResult> {
 const title = String(form.get("title") ?? "").trim();
 const body = String(form.get("body") ?? "").trim();
 const category = String(form.get("category") ?? "") as AnnouncementCategory;
 if (title.length < 5 || body.length < 20 || !category) return { error: "Complete the announcement title, category, and content." };
 const existing = String(form.get("id") ?? "");
 if (existing && existingRecord?.id !== existing) return { error: "Select an existing demo announcement." };
 const id = existing || crypto.randomUUID();
 const file = form.get("attachment");
 const patch = { title, body, category, status: form.get("status") === "published" ? "published" : "draft", updatedAt: new Date().toISOString(), ...(file instanceof File ? { attachmentName: file.name } : {}) };
 // Keep a full local row so publishing a draft also inserts it into employee lists
 // whose original sample data intentionally excluded unpublished announcements.
 editDemo({ collection: "announcements", id, created: {
  ...existingRecord, id, ...patch, issuedBy: existingRecord?.issuedBy ?? "Department Manager",
  publishedAt: existingRecord?.status === "published" ? existingRecord.publishedAt : new Date().toISOString(),
  tag: existingRecord?.tag ?? null,
  attachmentName: file instanceof File ? file.name : existingRecord?.attachmentName ?? null,
 } as { id: string } });
 return { ok: true, message: DEMO_MESSAGE };
}
