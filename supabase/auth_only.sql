-- Auth-only deployment alternative; apply only with explicit owner approval.
-- Fresh target or audited historical first-four-migrations schema. Never apply
-- the old five migrations blindly. No Auth user writes, emails, or HR deletions.
begin;
-- Authentication foundation: employee profiles linked to Supabase Auth users.
-- Passwords live only in auth.users. Roles are assigned by provisioning, never by users.

do $$ begin create type public.app_role as enum ('department_manager', 'employee'); exception when duplicate_object then null; end $$;
do $$ begin create type public.account_status as enum ('provisioned', 'invited', 'active', 'disabled'); exception when duplicate_object then null; end $$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  employee_code text not null unique check (employee_code = upper(employee_code)),
  email text not null unique check (email = lower(email)),
  first_name text not null,
  last_name text not null,
  role public.app_role not null,
  username text check (username ~ '^[a-z0-9._]{3,30}$'),
  account_status public.account_status not null default 'provisioned',
  invited_at timestamptz,
  activated_at timestamptz,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employees_username_lower_key on public.employees (lower(username));

alter table public.employees enable row level security;

alter table public.employees add column if not exists activation_claim_token uuid,
add column if not exists activation_claim_expires_at timestamptz,
add column if not exists activation_requested_at timestamptz;
do $$ begin
if not exists(select 1 from pg_constraint where conrelid='public.employees'::regclass and conname='employees_demo_identity') then
alter table public.employees add constraint employees_demo_identity check (
(email='danicaacosta544@gmail.com' and role='department_manager') or
(email='margaretsubong92@gmail.com' and role='employee'));
end if;
end $$;
create or replace function public.claim_account_activation(p_employee_code text, p_email text)
returns table (employee_id uuid, role public.app_role, claim_token uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_employee public.employees%rowtype;
  v_token uuid := pg_catalog.gen_random_uuid();
begin
  select e.* into v_employee from public.employees e
   where e.employee_code = p_employee_code and e.email = p_email
   for update;
  if not found or v_employee.account_status not in ('provisioned', 'invited')
     or v_employee.setup_completed_at is not null
     or v_employee.activation_claim_expires_at > now()
     or v_employee.activation_requested_at > now() - interval '60 seconds' then
    return;
  end if;
  update public.employees e set activation_claim_token = v_token,
    activation_claim_expires_at = now() + interval '5 minutes',
    activation_requested_at = now(), updated_at = now()
   where e.id = v_employee.id;
  return query select v_employee.id, v_employee.role, v_token;
end;
$$;

-- Lease-scoped reconciliation recovers an Auth user after a partial failure.
-- Never return an arbitrary email lookup to a public/authenticated caller.
create or replace function public.activation_auth_user(p_employee_id uuid, p_claim_token uuid)
returns table (user_id uuid, email_confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null
    from public.employees e join auth.users u on lower(u.email) = e.email
   where e.id = p_employee_id and e.activation_claim_token = p_claim_token
     and e.activation_claim_expires_at > now()
     and e.account_status in ('provisioned', 'invited')
     and e.setup_completed_at is null
     and (e.user_id is null or e.user_id = u.id)
     and u.deleted_at is null and not coalesce(u.is_anonymous, false)
     and not coalesce(u.is_sso_user, false)
     and (u.banned_until is null or u.banned_until <= now())
     and u.aud = 'authenticated'
     and not exists (select 1 from public.employees other
                     where other.user_id = u.id and other.id <> e.id)
   limit 1;
$$;

-- Prelink before delivery. Recheck lease, status, role, email, and ownership under
-- the profile row lock: a concurrent disable/activation must never be overwritten.
create or replace function public.link_account_activation(
  p_employee_id uuid, p_claim_token uuid, p_user_id uuid, p_role public.app_role
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype;
begin
  select e.* into v_employee from public.employees e
   where e.id = p_employee_id for update;
  if not found or v_employee.activation_claim_token is distinct from p_claim_token
     or v_employee.activation_claim_expires_at is null
     or v_employee.activation_claim_expires_at <= now()
     or v_employee.account_status not in ('provisioned', 'invited')
     or v_employee.setup_completed_at is not null
     or v_employee.role is distinct from p_role
     or (v_employee.user_id is not null and v_employee.user_id <> p_user_id) then
    return false;
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user_id
      and lower(u.email) = v_employee.email and u.aud = 'authenticated'
      and u.deleted_at is null and not coalesce(u.is_anonymous, false)
      and not coalesce(u.is_sso_user, false)
      and (u.banned_until is null or u.banned_until <= now())
  ) or exists (select 1 from public.employees e
               where e.user_id = p_user_id and e.id <> p_employee_id) then
    return false;
  end if;
  update public.employees e set user_id = p_user_id, account_status = 'invited',
    updated_at = now() where e.id = p_employee_id;
  return true;
end;
$$;

create or replace function public.release_account_activation(
  p_employee_id uuid, p_claim_token uuid, p_sent boolean
)
returns void language sql security definer set search_path = '' as $$
  update public.employees e set activation_claim_token = null,
    activation_claim_expires_at = null,
    invited_at = case when p_sent and e.account_status = 'invited'
                      then now() else e.invited_at end,
    updated_at = now()
   where e.id = p_employee_id and e.activation_claim_token = p_claim_token;
$$;

revoke all on function public.claim_account_activation(text, text) from public, anon, authenticated;
revoke all on function public.activation_auth_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.link_account_activation(uuid, uuid, uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.release_account_activation(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_account_activation(text, text) to service_role;
grant execute on function public.activation_auth_user(uuid, uuid) to service_role;
grant execute on function public.link_account_activation(uuid, uuid, uuid, public.app_role) to service_role;
grant execute on function public.release_account_activation(uuid, uuid, boolean) to service_role;

create or replace function public.complete_first_time_setup(p_username text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_username is null or p_username !~ '^[a-z0-9._]{3,30}$' then
    raise exception 'invalid username' using errcode = '22023';
  end if;
  update public.employees e set username = p_username, account_status = 'active',
    activated_at = coalesce(e.activated_at, now()), setup_completed_at = now(),
    activation_claim_token = null, activation_claim_expires_at = null, updated_at = now()
   where e.user_id = (select auth.uid()) and e.account_status = 'invited'
     and e.setup_completed_at is null
     and exists (
       select 1 from auth.users u where u.id = e.user_id
         and lower(u.email) = e.email and u.email_confirmed_at is not null
         and coalesce(u.encrypted_password, '') <> '' and u.deleted_at is null
         and not coalesce(u.is_anonymous, false)
         and not coalesce(u.is_sso_user, false) and u.aud = 'authenticated'
         and (u.banned_until is null or u.banned_until <= now())
     );
  if not found then
    raise exception 'setup not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.complete_first_time_setup(text) from public, anon;
grant execute on function public.complete_first_time_setup(text) to authenticated;


-- No direct application access, including historical column-level grants.
revoke all on public.employees from public,anon,authenticated;
do $$ declare c record; begin
for c in select column_name from information_schema.columns where table_schema='public' and table_name='employees' loop
execute format('revoke all (%I) on public.employees from public,anon,authenticated',c.column_name);
end loop; end $$;
grant all on public.employees to service_role;
create or replace function public.session_profile()
returns table(role public.app_role,first_name text,account_status public.account_status,setup_completed_at timestamptz)
language sql stable security definer set search_path='' as $$
select e.role,e.first_name,e.account_status,e.setup_completed_at
from public.employees e join auth.users u on u.id=e.user_id
where e.user_id=(select auth.uid()) and e.account_status in ('invited','active')
and lower(u.email)=e.email and u.email_confirmed_at is not null
and u.deleted_at is null and not coalesce(u.is_anonymous,false)
and not coalesce(u.is_sso_user,false) and u.aud='authenticated'
and (u.banned_until is null or u.banned_until<=now())
$$;
revoke all on function public.session_profile() from public,anon;
grant execute on function public.session_profile() to authenticated;
create or replace function public.can_recover_account(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.employees e join auth.users u on u.id=e.user_id
where e.email=p_email and lower(u.email)=e.email
and e.account_status='active' and e.setup_completed_at is not null
and u.email_confirmed_at is not null and u.deleted_at is null
and not coalesce(u.is_anonymous,false) and not coalesce(u.is_sso_user,false)
and u.aud='authenticated' and (u.banned_until is null or u.banned_until<=now()))
$$;
revoke all on function public.can_recover_account(text) from public,anon,authenticated;
grant execute on function public.can_recover_account(text) to service_role;
-- Retain historical HR data, revoke its application tables/RPCs.
do $$ declare t text; f record; c record; begin
foreach t in array array['departments','attendance_records','tasks','task_progress_updates','announcements','leave_types','leave_requests'] loop
if to_regclass('public.'||t) is not null then
execute format('revoke all on public.%I from public,anon,authenticated',t);
for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
execute format('revoke all (%I) on public.%I from public,anon,authenticated',c.column_name,t);
end loop; end if;
end loop;
for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('current_employee_id','current_department_id','managed_department_id','portal_employee_id','is_in_managed_department','my_approver','update_own_profile','my_tasks','update_task_progress','create_department_task','manager_update_task','archive_department_task','decide_leave_request','save_department_announcement','count_working_days','submit_leave_request') loop
execute format('revoke all on function %s from public,anon,authenticated',f.signature);
end loop; end $$;
-- Old owner-path policies allow HR uploads without helper functions.
-- Restrictive policy denies only the two retired demo buckets, preserves data.
do $$ begin
if to_regclass('storage.objects') is not null then
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ems_demo_hr_storage_disabled') then
    create policy ems_demo_hr_storage_disabled on storage.objects as restrictive
    for all to anon,authenticated
    using (bucket_id not in ('leave-documents','announcement-files'))
    with check (bucket_id not in ('leave-documents','announcement-files'));
  end if;
end if;
end $$;
commit;


