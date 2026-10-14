import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(filename, mocks = {}) {
 const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
 const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 const mod = { exports: {} };
 runInNewContext(compiled, { module: mod, exports: mod.exports, File, FormData, Date, crypto: { randomUUID },
  require(name) { assert.ok(Object.hasOwn(mocks, name), `Unexpected network/storage boundary: ${name}`); return mocks[name]; }
 });
 return mod.exports;
}
function fixture() {
 const store = load("lib/employee/demo-store.ts", { react: { useSyncExternalStore(_subscribe, snapshot) { return snapshot(); } } });
 const validation = load("lib/auth/validation.ts");
 const employee = load("lib/employee/actions.ts", { "./demo-store": store, "./format": { countWorkingDays: () => 2, todayKey: () => "2026-10-14" }, "@/lib/auth/validation": validation });
 const manager = load("lib/manager/actions.ts", { "@/lib/employee/demo-store": store });
 return { store, employee, manager };
}
test("task creation and updates affect only sample memory and reset discards them", async () => {
 const { store, manager } = fixture();
 const roster = [{ id: "sample-employee", name: "Sample Person", role: "employee", employmentStatus: "active" }];
 await manager.createTask({ assigneeId: roster[0].id, title: "A demo task", description: "Sample", dueDate: "2026-11-01", priority: "medium", status: "todo" }, roster);
 const rows = store.demoRows("tasks", []);
 assert.equal(rows.length, 1); assert.equal(rows[0].assigneeName, "Sample Person");
 await manager.updateTask({ taskId: rows[0].id, status: "completed", priority: "high", dueDate: "2026-11-02", remark: "Done" });
 assert.equal(store.demoRows("tasks", [])[0].status, "completed");
 store.resetDemo(); assert.equal(store.demoRows("tasks", []).length, 0);
});
test("leave rejection validates remarks; decisions update sample list only", async () => {
 const { store, manager } = fixture();
 assert.ok((await manager.decideLeave("sample", "rejected", "")).fieldErrors.remarks);
 const sample = [{ id: "sample", status: "pending" }];
 assert.equal(store.demoRows("leave", sample)[0].status, "pending");
 const result = await manager.decideLeave("sample", "approved");
 assert.match(result.message, /Demo only/); assert.equal(store.demoRows("leave", sample)[0].status, "approved");
 assert.equal(sample[0].status, "pending");
});
test("demo announcements and leave use filenames without any upload client", async () => {
 const { store, employee, manager } = fixture();
 const form = new FormData();
 form.set("title", "Sample announcement"); form.set("body", "A detailed sample announcement for demonstration."); form.set("category", "company_news"); form.set("status", "published");
 form.set("attachment", new File(["test"], "demo.pdf", { type: "application/pdf" }));
 assert.ok((await manager.saveAnnouncement(form)).ok);
 assert.equal(store.demoRows("announcements", [])[0].attachmentName, "demo.pdf");
 const leave = new FormData(); leave.set("leaveTypeId", "sample-type"); leave.set("startDate", "2026-11-02"); leave.set("endDate", "2026-11-03"); leave.set("reason", "A valid demo request.");
 const types = [{ id: "sample-type", code: "sick", name: "Sick Leave", requiresDocument: true }];
 assert.ok((await employee.submitLeaveRequest(leave, types)).fieldErrors.document);
 leave.set("document", new File(["test"], "evidence.pdf"));
 assert.ok((await employee.submitLeaveRequest(leave, types)).ok);
 assert.equal(store.demoRows("leave", [])[0].attachmentName, "evidence.pdf");
});
test("profile/password demo validation never changes authentication", async () => {
 const { employee } = fixture();
 const form = new FormData(); form.set("fullName", "A");
 assert.ok((await employee.updateOwnProfile(form)).fieldErrors.fullName);
 const password = new FormData(); password.set("currentPassword", "demo-current"); password.set("newPassword", "short"); password.set("confirmPassword", "different");
 assert.ok((await employee.changePassword(password)).fieldErrors.newPassword);
 password.set("newPassword", "DemoStrongPassword123!"); password.set("confirmPassword", "DemoStrongPassword123!");
 assert.match((await employee.changePassword(password)).message, /actual account password was not changed/);
});
test("every authenticated demo query checks server authorization before reading fixtures", async () => {
 const denied = async () => { throw new Error("denied"); };
 const employee = load("lib/employee/queries.ts", { "server-only": {}, "@/lib/auth/dal": { requireRole: denied }, "./preview-data": { buildPreviewData() { assert.fail("fixtures read before guard"); } } });
 for (const name of ["getTasks", "getAnnouncements", "getLeaveData", "getProfile", "getDashboard", "getAttendance", "getHeaderIdentity"])
  await assert.rejects(() => employee[name]("2026-10"), /denied/);
 const manager = load("lib/manager/queries.ts", { "server-only": {}, "@/lib/auth/dal": { requireRole: denied }, "./preview-data": { buildManagerPreviewData() { assert.fail("fixtures read before guard"); } } });
 await assert.rejects(() => manager.loadManagerData({ tasks: true }), /denied/);
 await assert.rejects(() => manager.getManagerContext(), /denied/);
});

test("employee views exclude tasks assigned to peers and dashboard pending count follows decisions", async () => {
 const { store, manager } = fixture();
 await manager.createTask({ assigneeId: "sample-peer", title: "Peer demo task", description: "Sample", dueDate: "2026-11-01", priority: "low", status: "todo" },
  [{ id: "sample-peer", name: "Peer", role: "employee", employmentStatus: "active" }]);
 assert.equal(store.useDemoRows("tasks", []).length, 0);
 assert.equal(store.useDemoManager({ tasks: [] }).tasks.length, 1);
 const data = { attendance: [], tasks: [], announcements: [], pendingLeaves: 1, leaveRequests: [{ id: "sample-leave", employeeId: store.DEMO_EMPLOYEE_ID, status: "pending" }] };
 assert.equal(store.useDemoDashboard(data).pendingLeaves, 1);
 await manager.decideLeave("sample-leave", "approved");
 assert.equal(store.useDemoDashboard(data).pendingLeaves, 0);
 assert.equal(data.leaveRequests[0].status, "pending");
});

test("demo tasks reject managers, inactive employees and missing assignees", async () => {
 const { store, manager } = fixture();
 const input = { assigneeId: "sample", title: "Sample task", description: "Sample", dueDate: "2026-11-01", priority: "low", status: "todo" };
 for (const roster of [[], [{ id: "sample", role: "department_manager", employmentStatus: "active" }],
  [{ id: "sample", role: "employee", employmentStatus: "on_leave" }]]) {
  assert.ok((await manager.createTask(input, roster)).fieldErrors.assigneeId);
 }
 assert.equal(store.demoRows("tasks", []).length, 0);
});

test("publishing a draft adds a complete announcement to employee samples without changing fixtures", async () => {
 const { store, manager } = fixture();
 const draft = { id: "sample-draft", title: "Sample draft", body: "Sample announcement body with valid details.", category: "company_news",
  status: "draft", issuedBy: "Sample Manager", publishedAt: "2026-10-01", updatedAt: "2026-10-01", attachmentName: "sample.pdf", tag: null };
 const form = new FormData();
 for (const [key, value] of Object.entries({ id: draft.id, title: draft.title, body: draft.body, category: draft.category, status: "published" })) form.set(key, value);
 assert.ok((await manager.saveAnnouncement(form, draft)).ok);
 const employeeRows = store.useDemoRows("announcements", []);
 assert.equal(employeeRows.length, 1);
 assert.equal(employeeRows[0].issuedBy, "Sample Manager");
 assert.equal(employeeRows[0].attachmentName, "sample.pdf");
 assert.equal(store.useDemoManager({ announcements: [draft] }).announcements.length, 1);
 assert.equal(draft.status, "draft");
 form.set("status", "draft");
 await manager.saveAnnouncement(form, draft);
 assert.equal(store.useDemoRows("announcements", []).length, 0);
});
