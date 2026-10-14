// Read-only local HTTP checks. Never submit forms, tokens or real credentials.
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Local targets only");
const production = process.argv.includes("--production");
const sections = {
  employee: ["dashboard", "attendance", "tasks", "announcements", "leave", "profile"],
  manager: ["dashboard", "employees", "attendance", "tasks", "leave", "announcements"],
};
let checks = 0;
async function request(path) {
  return fetch(new URL(path, origin), { redirect: "manual" });
}
const home = await request("/");
assert.equal(home.status, 307, "signed-out home");
assert.equal(new URL(home.headers.get("location"), origin).pathname, "/activate");
checks++;
for (const path of ["/login", "/activate", "/forgot-password"]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /<form\b/);
  checks++;
}
for (const [role, pages] of Object.entries(sections)) {
  for (const section of pages) {
    const path = `/${role}/${section}`;
    const guarded = await request(path);
    assert.equal(guarded.status, 307, path);
    const destination = new URL(guarded.headers.get("location"), origin);
    assert.equal(destination.pathname, "/login");
    assert.equal(destination.searchParams.get("next"), path);
    checks++;
    const preview = await request(`/preview${path}`);
    assert.equal(preview.status, production ? 404 : 200, `preview ${path}`);
    if (!production) {
      const html = await preview.text();
      assert.match(html, /<main\b/);
      assert.doesNotMatch(html, /waiting for database setup|data-next-error|Next.js encountered the unstable value|Hydration failed/);
    }
    checks++;
  }
}
for (const [path, destination] of [
  ["/setup", "/login"],
  ["/reset-password", "/auth/error"],
  ["/auth/confirm", "/auth/error"],
]) {
  const response = await request(path);
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, destination);
  checks++;
}
console.log(`${production ? "Production" : "Development"} read-only HTTP checks: ${checks} passed`);
