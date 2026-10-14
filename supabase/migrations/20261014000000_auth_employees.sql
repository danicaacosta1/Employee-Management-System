-- Authentication foundation: employee profiles linked to Supabase Auth users.
-- Passwords live only in auth.users. Roles are assigned by provisioning, never by users.

create type public.app_role as enum ('department_manager', 'employee');
create type public.account_status as enum ('provisioned', 'invited', 'active', 'disabled');

create table public.employees (
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

create unique index employees_username_lower_key on public.employees (lower(username));

alter table public.employees enable row level security;

-- Users read only their own profile. No insert/update/delete for app users:
-- writes go through security-definer RPCs or the secret key.
revoke all on public.employees from anon, authenticated;
grant select on public.employees to authenticated;

create policy "employees_select_own"
  on public.employees for select
  to authenticated
  using (user_id = (select auth.uid()));

-- First-time setup: sets the username and activates the caller's own profile, once.
create function public.complete_first_time_setup(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_username is null or p_username !~ '^[a-z0-9._]{3,30}$' then
    raise exception 'invalid username' using errcode = '22023';
  end if;

  update public.employees
     set username = p_username,
         account_status = 'active',
         activated_at = coalesce(activated_at, now()),
         setup_completed_at = now(),
         updated_at = now()
   where user_id = (select auth.uid())
     and account_status in ('invited', 'active')
     and setup_completed_at is null;

  if not found then
    raise exception 'setup not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.complete_first_time_setup(text) from public, anon;
grant execute on function public.complete_first_time_setup(text) to authenticated;
