-- Activation claim/reconciliation. Depends on the three portal migrations.
-- No Auth users or emails are created by this migration.
begin;

alter table public.employees
  add column activation_claim_token uuid,
  add column activation_claim_expires_at timestamptz,
  add column activation_requested_at timestamptz,
  add constraint employees_activation_claim_pair check (
    (activation_claim_token is null) = (activation_claim_expires_at is null)
  );

-- Remove the old table-wide SELECT immediately; a column-level REVOKE cannot
-- override it. Claim internals must be private even between migration boundaries.
revoke select on public.employees from anon, authenticated;
grant select (id, user_id, employee_code, email, first_name, last_name, role, username,
  account_status, invited_at, activated_at, setup_completed_at, created_at, updated_at,
  department_id, position, job_level, employment_type, employment_status, hire_date,
  phone, office_location, approver_id, avatar_path) on public.employees to authenticated;

create function public.claim_account_activation(p_employee_code text, p_email text)
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
     or v_employee.department_id is null
     or v_employee.employment_status not in ('active', 'on_leave')
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
create function public.activation_auth_user(p_employee_id uuid, p_claim_token uuid)
returns table (user_id uuid, email_confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null
    from public.employees e join auth.users u on lower(u.email) = e.email
   where e.id = p_employee_id and e.activation_claim_token = p_claim_token
     and e.activation_claim_expires_at > now()
     and e.account_status in ('provisioned', 'invited')
     and e.department_id is not null and e.employment_status in ('active', 'on_leave')
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
create function public.link_account_activation(
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
     or v_employee.department_id is null
     or v_employee.employment_status not in ('active', 'on_leave')
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

create function public.release_account_activation(
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
     and e.department_id is not null and e.employment_status in ('active', 'on_leave')
     and e.setup_completed_at is null
     and exists (
       select 1 from auth.users u where u.id = e.user_id
         and lower(u.email) = e.email and u.email_confirmed_at is not null
         and coalesce(u.encrypted_password, '') <> '' and u.deleted_at is null
         and not coalesce(u.is_anonymous, false)
         and (u.banned_until is null or u.banned_until <= now())
     );
  if not found then
    raise exception 'setup not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.complete_first_time_setup(text) from public, anon;
grant execute on function public.complete_first_time_setup(text) to authenticated;

commit;
