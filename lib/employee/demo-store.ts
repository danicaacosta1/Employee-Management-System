"use client";
import { useSyncExternalStore } from "react";
import type { Profile } from "./types";
export const DEMO_EMPLOYEE_ID = "e-elena";
type Row = { id: string };
type Collection = "tasks" | "leave" | "announcements";
type Edit = { collection: Collection; id: string; patch?: object; created?: Row; removed?: boolean };
let edits: Edit[] = [];
let profilePatch: Partial<Profile> = {};
let version = 0;
const listeners = new Set<() => void>();
export const DEMO_MESSAGE = "Demo only: changes remain in this tab until reload. No records or files are saved.";
function notify() { version++; for (const listener of listeners) listener(); }
export function editDemo(edit: Edit) { edits = [...edits, edit]; notify(); }
export function editDemoProfile(patch: Partial<Profile>) { profilePatch = { ...profilePatch, ...patch }; notify(); }
export function resetDemo() { edits = []; profilePatch = {}; notify(); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDemoVersion() { return useSyncExternalStore(subscribe, () => version, () => 0); }
export function demoRows<T extends Row>(collection: Collection, input: T[]): T[] {
 let rows = input;
 for (const edit of edits.filter(e => e.collection === collection)) {
  if (edit.created) rows = [edit.created as T, ...rows.filter(r => r.id !== edit.id)];
  if (edit.removed) rows = rows.filter(r => r.id !== edit.id);
  if (edit.patch) rows = rows.map(r => r.id === edit.id ? { ...r, ...edit.patch } : r);
 }
 return rows;
}
export function useDemoRows<T extends Row>(collection: Collection, input: T[]) {
 const revision = useDemoVersion();
 const rows = revision === 0 ? input : demoRows(collection, input);
 if (collection === "tasks") return rows.filter(r => !("assigneeId" in r) || r.assigneeId === DEMO_EMPLOYEE_ID);
 if (collection === "leave") return rows.filter(r => !("employeeId" in r) || r.employeeId === DEMO_EMPLOYEE_ID);
 if (collection === "announcements") return rows.filter(r => !("status" in r) || r.status === "published");
 return rows;
}
export function useDemoProfile(profile: Profile) {
 const revision = useDemoVersion(); return revision === 0 ? profile : { ...profile, ...profilePatch };
}
import type { ManagerData } from "@/lib/manager/types";
import type { DashboardData } from "./types";
export function useDemoManager<T extends Partial<ManagerData>>(data: T): T {
 const revision = useDemoVersion();
 if (!revision) return data;
 return { ...data,
  ...(data.tasks ? { tasks: demoRows("tasks", data.tasks) } : {}),
  ...(data.leave ? { leave: { ...data.leave, requests: demoRows("leave", data.leave.requests) } } : {}),
  ...(data.announcements ? { announcements: demoRows("announcements", data.announcements) } : {}),
 };
}
export function useDemoDashboard(data: DashboardData): DashboardData {
 const revision = useDemoVersion();
 if (!revision) return data;
 const leave = demoRows("leave", data.leaveRequests ?? []);
 return { ...data, tasks: demoRows("tasks", data.tasks).filter(t => !("assigneeId" in t) || t.assigneeId === DEMO_EMPLOYEE_ID),
 announcements: demoRows("announcements", data.announcements).filter(a => !("status" in a) || a.status === "published").slice(0, 3),
 pendingLeaves: data.leaveRequests ? leave.filter(r => r.status === "pending" && (!("employeeId" in r) || r.employeeId === DEMO_EMPLOYEE_ID)).length : data.pendingLeaves,
 };
}
