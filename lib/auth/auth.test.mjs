import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Load the server modules with mocked boundaries; never contact Supabase or send mail.
function load(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const loadedModule = { exports: {} };
  runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, process: { env: {} }, URL,
    console: { error() {} },
    require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "next/server") return { async connection() {} };
      if (name.startsWith("./")) return load(`${name}.ts`, mocks);
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return loadedModule.exports;
}

const { appOrigin, callbackDestination } = load("./callback.ts");
const { sendActivation } = load("./activation.ts");
const { isAuthorizedAccount } = load("./accounts.ts");
const { safeNext } = load("./roles.ts");

test("only the two fixed accounts and their provisioned roles are eligible", () => {
  assert.equal(isAuthorizedAccount("margaretsubong92@gmail.com", "employee"), true);
  assert.equal(isAuthorizedAccount("danicaacosta544@gmail.com", "department_manager"), true);
  assert.equal(isAuthorizedAccount("margaretsubong92@gmail.com", "department_manager"), false);
  assert.equal(isAuthorizedAccount("other@example.test"), false);
});

test("next paths are normalized before applying role boundaries", () => {
  assert.equal(safeNext("/employee/../manager/dashboard"), "/manager/dashboard");
  for (const value of ["//evil.test", "/employee/\\evil", "/employee/\npath", "https://evil.test"])
    assert.equal(safeNext(value), null);
});

test("trusted application origin rejects credentials, paths, queries, and external HTTP", () => {
  assert.equal(appOrigin("https://ems.example/"), "https://ems.example");
  assert.equal(appOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const value of [undefined, "https://user:pass@ems.example", "https://ems.example/path",
    "https://ems.example/?evil=1", "https://ems.example/#fragment", "http://ems.example", "javascript:evil"])
    assert.throws(() => appOrigin(value));
});

test("callback permits only invite/setup and recovery/setup-or-reset", () => {
  assert.equal(callbackDestination("invite", "/setup"), "/setup");
  assert.equal(callbackDestination("recovery", "/setup"), "/setup");
  assert.equal(callbackDestination("recovery", "/reset-password"), "/reset-password");
  for (const [type, next] of [["invite", "/reset-password"], ["signup", "/setup"],
    ["email_change", "/setup"], ["recovery", "https://evil.example"],
    ["recovery", "//evil.example"], ["recovery", "/manager/dashboard"], [null, "/setup"]])
    assert.equal(callbackDestination(type, next), null);
});

function client({ claim = true, existing = false, link = true, generationError = false,
  recovered = false, metadataError = false, deliveryError = false } = {}) {
  const events = [];
  let resolutions = 0;
  const authUser = { user_id: "auth-id", email_confirmed: existing };
  const admin = {
    async rpc(name, args) {
      events.push({ name, args });
      if (name === "claim_account_activation") return { data: claim
        ? [{ employee_id: "profile-id", role: "employee", claim_token: "lease-id" }] : [], error: null };
      if (name === "activation_auth_user") return { data:
        existing || (recovered && resolutions++ > 0) ? [authUser] : [], error: null };
      if (name === "link_account_activation") return { data: link, error: null };
      if (name === "release_account_activation") return { data: null, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    auth: {
      admin: {
        async generateLink() {
          events.push({ name: "generateLink" });
          return { data: { user: { id: "auth-id", email_confirmed_at: null } }, error: generationError };
        },
        async updateUserById() {
          events.push({ name: "updateUserById" });
          return { error: metadataError };
        },
        async inviteUserByEmail() {
          events.push({ name: "inviteUserByEmail" });
          return { error: deliveryError };
        },
      },
      async resetPasswordForEmail() {
        events.push({ name: "resetPasswordForEmail" });
        return { error: deliveryError };
      },
    },
  };
  return { admin, events };
}

const send = (admin) => sendActivation(admin, "EMP-001", "margaretsubong92@gmail.com",
  "https://ems.example/auth/confirm?next=/setup");

test("new activation links the profile before sending, releasing the lease only afterward", async () => {
  const { admin, events } = client();
  await send(admin);
  assert.deepEqual(events.map(({ name }) => name), ["claim_account_activation", "activation_auth_user",
    "generateLink", "link_account_activation", "inviteUserByEmail", "release_account_activation"]);
  assert.equal(events.at(-1).args.p_sent, true);
});

test("no claim (unknown, disabled, active, cooldown, or competing lease) makes no Auth call", async () => {
  const { admin, events } = client({ claim: false });
  await send(admin);
  assert.equal(events.length, 1);
});

test("expired lease or disabled/role-changed profile cannot send or overwrite state", async () => {
  const { admin, events } = client({ link: false });
  await send(admin);
  assert.equal(events.some(({ name }) => name === "inviteUserByEmail"), false);
  assert.equal(events.at(-1).args.p_sent, false);
});

test("confirmed orphan is prelinked and receives recovery instead of another invitation", async () => {
  const { admin, events } = client({ existing: true });
  await send(admin);
  assert.equal(events.some(({ name }) => name === "generateLink" || name === "inviteUserByEmail"), false);
  assert.equal(events.findIndex(({ name }) => name === "link_account_activation")
    < events.findIndex(({ name }) => name === "resetPasswordForEmail"), true);
});

test("Auth-side race is reconciled after generateLink fails", async () => {
  const { admin, events } = client({ generationError: true, recovered: true });
  await send(admin);
  assert.equal(events.filter(({ name }) => name === "activation_auth_user").length, 2);
  assert.equal(events.at(-1).args.p_sent, true);
});

test("delivery failures release the claim while preserving failure outcome", async () => {
  for (const options of [{ deliveryError: true }]) {
    const { admin, events } = client(options);
    await assert.rejects(send(admin));
    assert.equal(events.at(-1).name, "release_account_activation");
    assert.equal(events.at(-1).args.p_sent, false);
    if (options.metadataError) assert.equal(events.some(({ name }) => name === "inviteUserByEmail"), false);
  }
});

test("activation response is identical for eligibility outcomes and operational failure", async () => {
  const form = new Map([["employeeId", "EMP-001"], ["email", "margaretsubong92@gmail.com"]]);
  const outcomes = [];
  for (const fail of [false, true]) {
    const { activateAccount } = load("./actions.ts", {
      "next/headers": {}, "next/navigation": { redirect() { throw new Error("Unexpected redirect"); } },
      "@/lib/supabase/admin": { createAdminClient: () => ({}) },
      "@/lib/supabase/server": {}, "@/lib/supabase/cookies": {}, "./dal": {},
      "./callback": { appOrigin: () => "https://ems.example" },
      "./activation": { async sendActivation() { if (fail) throw new Error("Unavailable"); } },
    });
    outcomes.push(JSON.stringify(await activateAccount({}, form)));
  }
  assert.equal(outcomes[0], outcomes[1]);
  assert.match(outcomes[0], /If your account is eligible/);
});

test("confirmation route rejects unexpected types/destinations before touching Auth", async () => {
  const calls = [];
  const { GET } = load("../../app/(auth)/auth/confirm/route.ts", {
    "next/server": { NextResponse: { redirect: (url) => ({ href: url.href, headers: new Map() }) } },
    "@/lib/auth/callback": { appOrigin: () => "https://ems.example", callbackDestination },
    "@/lib/auth/accounts": { isAuthorizedAccount },
    "@/lib/auth/roles": load("./roles.ts"),
    "@/lib/supabase/server": { async createClient() { return {
      async rpc() { return { data: [{ role: "employee", account_status: "active", setup_completed_at: "2026-10-14" }], error: null }; },
      auth: {
      async verifyOtp(args) { calls.push(args); return { error: null }; },
      async exchangeCodeForSession(code) { calls.push(code); return { error: null }; },
      async getUser() { return { data: { user: { email: "margaretsubong92@gmail.com" } } }; },
      async signOut() {},
    } }; } },
  });
  for (const query of ["token_hash=token&type=signup&next=/setup",
    "token_hash=token&type=invite&next=/manager/dashboard",
    "token_hash=token&type=recovery&next=//evil.example",
    "code=code&next=/setup", "code=code&type=invite&next=/setup",
    "code=code&token_hash=token&type=invite&next=/setup"]) {
    const result = await GET({ nextUrl: new URL(`https://untrusted.example/auth/confirm?${query}`) });
    assert.equal(result.href, "https://ems.example/auth/error?reason=link-expired");
  }
  assert.equal(calls.length, 0);
  assert.equal((await GET({ nextUrl: new URL("https://untrusted.example/auth/confirm?token_hash=token&type=invite&next=/setup") })).href,
    "https://ems.example/setup");
  assert.equal((await GET({ nextUrl: new URL("https://untrusted.example/auth/confirm?code=code&next=/reset-password") })).href,
    "https://ems.example/reset-password");
  assert.equal(calls.length, 2);
});

test("proxy never redirects a valid session using stale JWT role metadata", async () => {
  const { proxy } = load("../../proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: {
      async getClaims() { return { data: { claims: { sub: "auth-id", app_metadata: { role: "department_manager" } } } }; },
    } }) },
    "next/server": { NextResponse: {
      next: () => ({ kind: "next", cookies: { getAll: () => [] } }),
      redirect() { throw new Error("Stale-role redirect"); },
    } },
    "@/lib/supabase/cookies": { SESSION_SCOPE_COOKIE: "scope" },
  });
  for (const path of ["/employee/dashboard", "/manager/dashboard", "/login", "/activate"]) {
    assert.equal((await proxy({ nextUrl: new URL(`https://ems.example${path}`),
      cookies: { get: () => undefined } })).kind, "next");
  }
});

function actionMocks(overrides = {}) {
  return {
    "next/headers": { async cookies() { return { delete() {}, set() {} }; } },
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/supabase/admin": {}, "@/lib/supabase/server": {},
    "@/lib/supabase/cookies": { SESSION_SCOPE_COOKIE: "scope" }, "./dal": {},
    "./callback": { appOrigin: () => "https://ems.example" }, "./activation": {},
    ...overrides,
  };
}

test("callback fails closed for expired/reused tokens and unauthorized profiles", async () => {
  for (const scenario of ["expired", "reused", "missing-profile", "wrong-role", "disabled"]) {
    let signedOut = false;
    const { GET } = load("../../app/(auth)/auth/confirm/route.ts", {
      "next/server": { NextResponse: { redirect: (url) => ({ href: url.href, headers: new Map() }) } },
      "@/lib/auth/callback": { appOrigin: () => "https://ems.example", callbackDestination },
      "@/lib/auth/accounts": { isAuthorizedAccount }, "@/lib/auth/roles": load("./roles.ts"),
      "@/lib/supabase/server": { async createClient() { return {
        async rpc() { return { error: null, data: scenario === "missing-profile" ? [] : [{
          role: scenario === "wrong-role" ? "department_manager" : "employee",
          account_status: scenario === "disabled" ? "disabled" : "invited",
        }] }; },
        auth: {
          async verifyOtp() { return { error: ["expired", "reused"].includes(scenario) ? { code: "otp_expired" } : null }; },
          async getUser() { return { data: { user: { email: "margaretsubong92@gmail.com" } } }; },
          async signOut() { signedOut = true; },
        },
      }; } },
    });
    const result = await GET({ nextUrl: new URL("https://ems.example/auth/confirm?token_hash=fixture&type=invite&next=/setup") });
    assert.equal(result.href, `https://ems.example/auth/error?reason=${["expired", "reused"].includes(scenario) ? "link-expired" : "account-unavailable"}`);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer");
    if (!["expired", "reused"].includes(scenario)) assert.equal(signedOut, true);
  }
});

test("login rejects unknown accounts before Auth and redirects only within the user's role", async () => {
  let calls = 0;
  let session = { role: "employee", setupComplete: true };
  const { signIn } = load("./actions.ts", actionMocks({
    "@/lib/supabase/server": { async createClient() { return { auth: {
      async signInWithPassword() { calls++; return { error: null }; }, async signOut() {},
    } }; } },
    "./dal": { async getSessionUser() { return session; } },
  }));
  assert.ok((await signIn({}, new Map([["email", "other@example.test"], ["password", "test1234"]]))).error);
  assert.equal(calls, 0);
  const form = new Map([["email", "margaretsubong92@gmail.com"], ["password", "test1234"],
    ["next", "/employee/../manager/dashboard"]]);
  await assert.rejects(signIn({}, form), /REDIRECT:\/employee\/dashboard/);
  session = { role: "department_manager", setupComplete: true };
  await assert.rejects(signIn({}, form), /REDIRECT:\/manager\/dashboard/);
  session = { role: "employee", setupComplete: false };
  await assert.rejects(signIn({}, form), /REDIRECT:\/setup/);
});

test("recovery is generic and sends only for an authorized, eligible completed account", async () => {
  let eligible = false;
  let sends = 0;
  let checks = 0;
  const { requestPasswordReset } = load("./actions.ts", actionMocks({
    "@/lib/supabase/admin": { createAdminClient() { return {
      async rpc(name) { assert.equal(name, "can_recover_account"); checks++; return { data: eligible, error: null }; },
    }; } },
    "@/lib/supabase/server": { async createClient() { return { auth: {
      async resetPasswordForEmail() { sends++; return { error: null }; },
    } }; } },
  }));
  const unknown = await requestPasswordReset({}, new Map([["email", "other@example.test"]]));
  assert.equal(checks, 0);
  const unavailable = await requestPasswordReset({}, new Map([["email", "margaretsubong92@gmail.com"]]));
  assert.equal(sends, 0);
  eligible = true;
  const allowed = await requestPasswordReset({}, new Map([["email", "margaretsubong92@gmail.com"]]));
  assert.equal(sends, 1);
  assert.equal(unknown.success, unavailable.success);
  assert.equal(unknown.success, allowed.success);
});

test("setup can retry the same password after a username persistence error", async () => {
  let attempts = 0;
  const { completeSetup } = load("./actions.ts", actionMocks({
    "./dal": { async getSessionUser() { return { role: "employee", setupComplete: false }; } },
    "@/lib/supabase/server": { async createClient() { return {
      auth: { async updateUser() { return { error: attempts ? { code: "same_password" } : null }; } },
      async rpc() { attempts++; return { error: attempts === 1 ? { code: "23505" } : null }; },
    }; } },
  }));
  const form = new Map([["username", "margaret"], ["password", "test1234"], ["confirm", "test1234"]]);
  assert.match((await completeSetup({}, form)).fieldErrors.username, /already taken/);
  form.set("username", "margaret2");
  await assert.rejects(completeSetup({}, form), /REDIRECT:\/employee\/dashboard/);
  assert.equal(attempts, 2);
});

test("DAL rejects disabled or wrongly paired accounts and enforces onboarding and both role boundaries", async () => {
  let profile = { role: "employee", first_name: "Demo", account_status: "invited", setup_completed_at: null };
  const { getSessionUser, requireRole } = load("./dal.ts", {
    react: { cache: (fn) => fn },
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/supabase/server": { async createClient() { return {
      auth: { async getClaims() { return { data: { claims: { sub: "id", email:
        profile.role === "department_manager" ? "danicaacosta544@gmail.com" : "margaretsubong92@gmail.com" } } }; } },
      async rpc() { return { data: [profile] }; },
    }; } },
  });
  await assert.rejects(requireRole("employee"), /REDIRECT:\/setup/);
  profile = { ...profile, account_status: "active", setup_completed_at: "2026-10-14" };
  assert.equal((await requireRole("employee")).role, "employee");
  await assert.rejects(requireRole("department_manager"), /REDIRECT:\/employee\/dashboard/);
  profile.role = "department_manager";
  await assert.rejects(requireRole("employee"), /REDIRECT:\/manager\/dashboard/);
  profile.account_status = "disabled";
  assert.equal(await getSessionUser(), null);
});

test("recovery token-hash callbacks resume incomplete setup and reset completed accounts", async () => {
  for (const complete of [false, true]) {
    const verified = [];
    const { GET } = load("../../app/(auth)/auth/confirm/route.ts", {
      "next/server": { NextResponse: { redirect: url => ({ href: url.href, headers: new Map() }) } },
      "@/lib/auth/callback": { appOrigin: () => "https://ems.example", callbackDestination },
      "@/lib/auth/accounts": { isAuthorizedAccount }, "@/lib/auth/roles": load("./roles.ts"),
      "@/lib/supabase/server": { async createClient(options) {
        assert.equal(options.strictCookies, true);
        return { auth: {
          async verifyOtp(input) { verified.push(input); return { error: null }; },
          async getUser() { return { data: { user: { email: "danicaacosta544@gmail.com" } } }; },
          async signOut() {},
        }, async rpc() { return { data: [{ role: "department_manager", account_status: complete ? "active" : "invited",
          setup_completed_at: complete ? "2026-10-14" : null }], error: null }; } };
      } },
    });
    const response = await GET({ nextUrl: new URL("https://ems.example/auth/confirm?token_hash=fixture_hash&type=recovery&next=%2Freset-password") });
    assert.equal(response.href, `https://ems.example/${complete ? "reset-password" : "setup"}`);
    assert.equal(JSON.stringify(verified), JSON.stringify([{ type: "recovery", token_hash: "fixture_hash" }]));
  }
});

test("callback session failure is distinguished from an expired token", async () => {
  const { GET } = load("../../app/(auth)/auth/confirm/route.ts", {
    "next/server": { NextResponse: { redirect: url => ({ href: url.href, headers: new Map() }) } },
    "@/lib/auth/callback": { appOrigin: () => "https://ems.example", callbackDestination },
    "@/lib/auth/accounts": { isAuthorizedAccount }, "@/lib/auth/roles": load("./roles.ts"),
    "@/lib/supabase/server": { async createClient() { throw new Error("mock cookie failure"); } },
  });
  const response = await GET({ nextUrl: new URL("https://ems.example/auth/confirm?token_hash=fixture&type=invite&next=/setup") });
  assert.equal(response.href, "https://ems.example/auth/error?reason=session-failed");
});

test("legacy implicit redirects and provider error parameters cannot verify a token", async () => {
  let clients = 0;
  const { GET } = load("../../app/(auth)/auth/confirm/route.ts", {
    "next/server": { NextResponse: { redirect: url => ({ href: url.href, headers: new Map() }) } },
    "@/lib/auth/callback": { appOrigin: () => "https://ems.example", callbackDestination },
    "@/lib/auth/accounts": { isAuthorizedAccount }, "@/lib/auth/roles": load("./roles.ts"),
    "@/lib/supabase/server": { async createClient() { clients++; assert.fail("unexpected Auth call"); } },
  });
  for (const query of ["next=/setup", "error=access_denied&error_code=otp_expired&next=/setup",
    "token_hash=fixture&type=invite&next=/setup&error=access_denied"]) {
    const response = await GET({ nextUrl: new URL(`https://ems.example/auth/confirm?${query}`) });
    assert.equal(response.href, "https://ems.example/auth/error?reason=link-expired");
  }
  assert.equal(clients, 0);
});

test("SSR cookie adapter persists session/deletion options and rejects callback write failures", async () => {
  let adapter;
  let fail = false;
  const writes = [];
  const { scopeCookieOptions, SESSION_SCOPE_COOKIE } = load("../supabase/cookies.ts");
  const { createClient } = load("../supabase/server.ts", {
    "@supabase/ssr": { createServerClient(_url, _key, options) { adapter = options.cookies; return {}; } },
    "next/headers": { async cookies() { return {
      get: name => name === SESSION_SCOPE_COOKIE ? { value: "browser" } : undefined,
      getAll: () => [], set(name, value, options) { if (fail) throw new Error("write failed"); writes.push({ name, value, options }); },
    }; } },
    "./cookies": { scopeCookieOptions, SESSION_SCOPE_COOKIE },
  });
  await createClient({ strictCookies: true });
  adapter.setAll([{ name: "session", value: "fixture", options: { maxAge: 3600, sameSite: "lax" } }]);
  assert.equal(writes[0].options.maxAge, undefined);
  adapter.setAll([{ name: "session", value: "", options: { maxAge: 0 } }]);
  assert.equal(writes[1].options.maxAge, 0);
  fail = true;
  assert.throws(() => adapter.setAll([{ name: "session", value: "fixture", options: {} }]), /write failed/);
  await createClient({ sessionOnly: false });
  fail = false;
  adapter.setAll([{ name: "session", value: "fixture", options: { maxAge: 3600 } }]);
  assert.equal(writes[2].options.maxAge, 3600);
});

test("prepared email templates use direct callbacks with correctly decoded destinations", () => {
  for (const [name, type, next] of [["invite", "invite", "/setup"], ["recovery", "recovery", "/reset-password"]]) {
    const template = readFileSync(new URL(`../../supabase/templates/${name}.html`, import.meta.url), "utf8");
    assert.doesNotMatch(template, /ConfirmationURL|auth\/v1\/verify/);
    const href = template.match(/href="([^"]+)"/)[1].replace("{{ .SiteURL }}", "https://ems.example")
      .replace("{{ .TokenHash }}", "fixture_hash").replaceAll("&amp;", "&");
    const url = new URL(href);
    assert.equal(url.pathname, "/auth/confirm");
    assert.equal(url.searchParams.get("token_hash"), "fixture_hash");
    assert.equal(callbackDestination(url.searchParams.get("type"), url.searchParams.get("next")), next);
    assert.equal(url.searchParams.get("type"), type);
  }
});

test("public entry screens use database onboarding and roles, ignoring Auth role metadata", async () => {
  for (const scenario of ["signed-out", "incomplete", "employee", "manager"]) {
    const manager = scenario === "manager";
    const { redirectAuthenticatedUser } = load("./dal.ts", {
      react: { cache: fn => fn },
      "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
      "@/lib/supabase/server": { async createClient() { return {
        auth: { async getClaims() { return { data: { claims: scenario === "signed-out" ? null : {
          sub: "fixture", email: manager ? "danicaacosta544@gmail.com" : "margaretsubong92@gmail.com",
          app_metadata: { role: manager ? "employee" : "department_manager" },
        } } }; } },
        async rpc(name) { assert.equal(name, "session_profile"); return { data: [{
          role: manager ? "department_manager" : "employee", first_name: "Sample",
          account_status: scenario === "incomplete" ? "invited" : "active",
          setup_completed_at: scenario === "incomplete" ? null : "2026-10-14",
        }] }; },
      }; } },
    });
    const { AuthEntryGate } = load("../../components/auth/entry-gate.tsx", {
      "@/lib/auth/dal": { redirectAuthenticatedUser },
    });
    const expected = scenario === "incomplete" ? "/setup" : manager ? "/manager/dashboard" : "/employee/dashboard";
    if (scenario === "signed-out") assert.equal(await AuthEntryGate({ children: "existing form" }), "existing form");
    else await assert.rejects(AuthEntryGate({ children: "existing form" }), new RegExp(`REDIRECT:${expected}`));

    const { default: Home } = load("../../app/page.tsx", {
      react: { Suspense: "suspense" }, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
      "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
      "@/lib/auth/dal": { redirectAuthenticatedUser },
    });
    await assert.rejects(Home().props.children.type(), new RegExp(`REDIRECT:${scenario === "signed-out" ? "/activate" : expected}`));
  }
});

test("proxy redirects signed-out root to activation without affecting login", async () => {
  const { proxy } = load("../../proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: { async getClaims() { return { data: null }; } } }) },
    "@/lib/supabase/cookies": { SESSION_SCOPE_COOKIE: "scope" },
    "next/server": { NextResponse: {
      next: () => ({ kind: "next", cookies: { getAll: () => [] } }),
      redirect: url => ({ href: url.href, cookies: { set() {} } }),
    } },
  });
  const request = path => ({ url: `https://ems.example${path}`, nextUrl: new URL(`https://ems.example${path}`), cookies: { get: () => undefined } });
  assert.equal((await proxy(request("/"))).href, "https://ems.example/activate");
  assert.equal((await proxy(request("/login"))).kind, "next");
  assert.equal((await proxy(request("/activate"))).kind, "next");
});

test("session validation waits for a real request before the Supabase expiry clock can run", async () => {
 let resume;
 const ready = new Promise(resolve => { resume = resolve; });
 const events = [];
 const { getSessionUser } = load("./dal.ts", {
  react: { cache: fn => fn }, "next/navigation": {},
  "next/server": { async connection() { events.push("request-boundary"); await ready; } },
  "@/lib/supabase/server": { async createClient() {
   events.push("client-created"); return { auth: { async getClaims() { events.push("expiry-validation"); return { data: null }; } } };
  } },
 });
 const user = getSessionUser();
 await Promise.resolve();
 assert.deepEqual(events, ["request-boundary"]);
 resume();
 assert.equal(await user, null);
 assert.deepEqual(events, ["request-boundary", "client-created", "expiry-validation"]);
});
