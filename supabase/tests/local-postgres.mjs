// Disposable in-memory PostgreSQL only. No URLs, .env, Supabase client or SMTP.
// Install the pinned engine under .local-db-test; see DEPLOYMENT.md.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "../../.local-db-test/node_modules/@electric-sql/pglite/dist/index.js";
import { btree_gist } from "../../.local-db-test/node_modules/@electric-sql/pglite/dist/contrib/btree_gist.js";
import { verifyActivation } from "./activation-scenarios.mjs";
import { verifyPortal } from "./portal-scenarios.mjs";

const db = new PGlite({ extensions: { btree_gist } });
const evidence = { engine: null, enginePackage: null, migrations: [], checks: [], limitations: [
  "Minimal Auth/Storage compatibility schemas, not a Supabase stack",
  "No Auth API, SMTP, PostgREST, signed URLs or physical object storage tested",
  "Single database connection; no simultaneous transaction/concurrency proof",
  "Real Supabase migration-role permissions and managed-schema upgrades unverified",
] };
const bootstrap = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role supabase_storage_admin nologin;
create role ems_migrator nologin nosuperuser;
grant supabase_storage_admin to ems_migrator;
grant create on database postgres to ems_migrator;
grant usage, create on schema public to ems_migrator;
grant usage on schema public to anon, authenticated, service_role;
create schema extensions authorization ems_migrator;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth authorization supabase_auth_admin;
create schema storage authorization supabase_storage_admin;
grant usage on schema auth, storage to ems_migrator, anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, email text unique, aud text default 'authenticated',
  email_confirmed_at timestamptz, encrypted_password text, deleted_at timestamptz,
  is_anonymous boolean default false, is_sso_user boolean default false, banned_until timestamptz
);
alter table auth.users owner to supabase_auth_admin;
grant select, references on auth.users to ems_migrator;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner_id text, metadata jsonb, unique(bucket_id, name)
);
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to ems_migrator, anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]
$$;
alter default privileges for role ems_migrator in schema public
  grant all on tables to service_role;
alter default privileges for role ems_migrator in schema public
  grant all on sequences to service_role;
alter default privileges for role ems_migrator in schema public
  grant execute on functions to anon, authenticated, service_role;
set role ems_migrator;
set search_path = public, extensions;
`;

async function query(sql, values = []) { return (await db.query(sql, values)).rows; }
async function scalar(sql, values = []) { return Object.values((await query(sql, values))[0])[0]; }
async function check(name, work) {
  await work();
  evidence.checks.push(name);
  console.log(`PASS ${name}`);
}
async function as(role, uid, work) {
  assert.ok(["authenticated", "anon", "service_role", "ems_migrator"].includes(role));
  await db.exec(`set role ${role}`);
  await query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  try { return await work(); }
  finally { await db.exec("reset role"); await query("select set_config('request.jwt.claim.sub', '', false)"); }
}
async function denied(sql, code, values = []) {
  await assert.rejects(() => db.query(sql, values), (error) => {
    assert.equal(error.code, code, `${error.message} (expected ${code})`);
    return true;
  });
}

try {
  evidence.engine = await scalar("select version()");
  evidence.enginePackage = JSON.parse(await readFile(new URL("../../.local-db-test/node_modules/@electric-sql/pglite/package.json", import.meta.url), "utf8")).version;
  await db.exec(bootstrap);
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(files.length, 5);
  for (const filename of files) {
    const sql = await readFile(new URL(filename, directory), "utf8");
    try { await db.exec(sql); }
    catch (error) { console.error(`FAIL ${filename}: ${error.code} ${error.message}`); throw error; }
    evidence.migrations.push({ filename, sha256: createHash("sha256").update(sql).digest("hex") });
    console.log(`APPLIED ${filename}`);
  }
  await db.exec("reset role");
  await check("all public tables have RLS", async () => {
    const tables = await query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    assert.equal(tables.length, 8);
    assert.ok(tables.every((table) => table.relrowsecurity));
  });
  await check("one announcement RPC with eight arguments", async () => {
    assert.deepEqual(await query("select pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='save_department_announcement'"), [{ pronargs: 8 }]);
  });
  await check("security-definer functions fix their search path", async () => {
    const functions = await query("select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosecdef");
    assert.ok(functions.length > 20);
    assert.ok(functions.every((fn) => fn.proconfig?.includes('search_path=""')));
  });
  await check("migration executor is not superuser and Storage ownership is preserved", async () => {
    assert.equal(await scalar("select rolsuper from pg_roles where rolname='ems_migrator'"), false);
    assert.equal(await scalar("select pg_get_userbyid(relowner) from pg_class where oid='storage.objects'::regclass"), "supabase_storage_admin");
  });
  await check("activation internals and working-day helper deny app roles", async () => {
    for (const signature of ["claim_account_activation(text,text)", "activation_auth_user(uuid,uuid)",
      "link_account_activation(uuid,uuid,uuid,app_role)", "release_account_activation(uuid,uuid,boolean)",
      "count_working_days(date,date)", "lock_portal_integrity()", "assert_portal_relationships()"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(await scalar("select has_function_privilege($1, $2, 'execute')", [role, `public.${signature}`]), false);
      }
    }
  });
  await check("private buckets and no direct portal writes", async () => {
    assert.equal(await scalar("select count(*)::integer from storage.buckets where not public"), 2);
    for (const table of ["employees", "tasks", "task_progress_updates", "leave_requests", "announcements"]) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal(await scalar("select has_table_privilege('authenticated', $1, $2)", [`public.${table}`, privilege]), false);
      }
    }
    assert.equal(await scalar("select has_column_privilege('authenticated', 'public.employees', 'activation_claim_token', 'SELECT')"), false);
  });
  await verifyPortal({ db, query, scalar, as, denied, check });
  await verifyActivation({ db, query, scalar, as, denied, check });

  await check("invalid legacy data rolls back the fifth migration without partial hardening", async () => {
    const legacyDb = new PGlite({ extensions: { btree_gist } });
    try {
      await legacyDb.exec(bootstrap);
      for (const filename of files.slice(0, 4)) await legacyDb.exec(await readFile(new URL(filename, directory), "utf8"));
      await legacyDb.exec(`insert into public.employees(employee_code,email,first_name,last_name,role)
        values('LEG-MGR','legacy@ems-synthetic.invalid','Synthetic','Legacy','department_manager')`);
      await assert.rejects(() => readFile(new URL(files[4], directory), "utf8").then((sql) => legacyDb.exec(sql)),
        (error) => error.code === "23514");
      await legacyDb.exec("rollback");
      assert.equal((await legacyDb.query("select to_regprocedure('public.session_profile()') as result")).rows[0].result, null);
      assert.equal((await legacyDb.query("select count(*)::integer as count from public.employees where employee_code='LEG-MGR' and department_id is null")).rows[0].count, 1);
      assert.equal((await legacyDb.query("select count(*)::integer as count from pg_constraint where conname='departments_code_normalized'")).rows[0].count, 0);
    } finally { await legacyDb.close(); }
  });

  await writeFile(new URL("../LOCAL_SQL_VALIDATION.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(`COMPLETE ${evidence.migrations.length} migrations; ${evidence.checks.length} checks; ${evidence.engine}`);
} finally { await db.close(); }
