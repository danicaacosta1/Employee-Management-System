-- Employee portal schema: departments, attendance, tasks, announcements, leave.
-- Depends on 20261014000000_auth_employees.sql. Employees read only their own
-- data; every write goes through a security-definer RPC with explicit checks.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------- departments
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------ employee profile data
alter table public.employees
  add column department_id uuid references public.departments (id),
  add column position text,
  add column job_level text,
  add column employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'probationary')),
  add column employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'inactive')),
  add column hire_date date,
  add column phone text check (char_length(phone) <= 20),
  add column office_location text,
  add column approver_id uuid references public.employees (id),
  add column avatar_path text,
  add constraint employees_approver_not_self check (approver_id <> id);

create index employees_department_idx on public.employees (department_id);
create index employees_approver_idx on public.employees (approver_id);

create function public.current_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.employees
   where user_id = (select auth.uid()) and account_status <> 'disabled'
$$;

create function public.current_department_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select department_id from public.employees
   where user_id = (select auth.uid()) and account_status <> 'disabled'
$$;

revoke execute on function public.current_employee_id() from public, anon;
revoke execute on function public.current_department_id() from public, anon;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.current_department_id() to authenticated;

alter table public.departments enable row level security;
revoke all on public.departments from anon, authenticated;
grant select on public.departments to authenticated;
create policy "departments_select_own" on public.departments for select to authenticated
  using (id = (select public.current_department_id()));

-- Name/position of the caller's approving manager only.
create function public.my_approver()
returns table (full_name text, "position" text)
language sql stable security definer set search_path = '' as $$
  select a.first_name || ' ' || a.last_name, a.position
    from public.employees e
    join public.employees a on a.id = e.approver_id
   where e.id = (select public.current_employee_id())
$$;

-- Whitelisted self-service fields only (name and phone, per the profile design).
create function public.update_own_profile(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  update public.employees
     set first_name = split_part(v_name, ' ', 1),
         last_name = coalesce(nullif(substr(v_name, strpos(v_name, ' ') + 1), v_name), ''),
         phone = v_phone,
         updated_at = now()
   where id = (select public.current_employee_id());
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- ----------------------------------------------------------------- attendance
create type public.attendance_status as enum
  ('present', 'late', 'absent', 'on_leave', 'holiday', 'weekend');

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  time_in timestamptz,
  time_out timestamptz check (time_out is null or time_out > time_in),
  worked_minutes integer generated always as (
    case when time_in is not null and time_out is not null
      then (extract(epoch from time_out - time_in) / 60)::integer end
  ) stored,
  status public.attendance_status not null,
  shift_label text,
  notes text check (char_length(notes) <= 500),
  source text not null default 'import' check (source in ('seed', 'import', 'system', 'manager')),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

alter table public.attendance_records enable row level security;
revoke all on public.attendance_records from anon, authenticated;
grant select on public.attendance_records to authenticated;
create policy "attendance_select_own" on public.attendance_records for select to authenticated
  using (employee_id = (select public.current_employee_id()));

-- ---------------------------------------------------------------------- tasks
create type public.task_status as enum ('todo', 'in_progress', 'completed');
create type public.task_priority as enum ('low', 'medium', 'high');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique,
  project text,
  department_id uuid references public.departments (id),
  title text not null check (char_length(title) between 3 and 150),
  description text check (char_length(description) <= 5000),
  assigned_to uuid not null references public.employees (id),
  created_by uuid not null references public.employees (id),
  assigned_at timestamptz not null default now(),
  due_date date not null,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assigned_to, status, due_date);

create table public.task_progress_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.employees (id),
  from_status public.task_status,
  to_status public.task_status,
  remark text check (char_length(remark) <= 1000),
  created_at timestamptz not null default now()
);
create index task_progress_task_idx on public.task_progress_updates (task_id, created_at desc);

alter table public.tasks enable row level security;
alter table public.task_progress_updates enable row level security;
revoke all on public.tasks, public.task_progress_updates from anon, authenticated;
grant select on public.tasks, public.task_progress_updates to authenticated;
create policy "tasks_select_assigned" on public.tasks for select to authenticated
  using (assigned_to = (select public.current_employee_id()) and archived_at is null);
create policy "task_progress_select_assigned" on public.task_progress_updates for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                  and t.assigned_to = (select public.current_employee_id())));

-- Caller's tasks with assigner name/position and latest remark.
create function public.my_tasks()
returns table (
  id uuid, task_code text, project text, title text, description text,
  assigned_at timestamptz, due_date date, priority public.task_priority,
  status public.task_status, assigned_by_name text, assigned_by_position text,
  latest_remark text
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.task_code, t.project, t.title, t.description, t.assigned_at, t.due_date,
         t.priority, t.status, c.first_name || ' ' || c.last_name, c.position,
         (select u.remark from public.task_progress_updates u
           where u.task_id = t.id and u.remark is not null
           order by u.created_at desc limit 1)
    from public.tasks t
    join public.employees c on c.id = t.created_by
   where t.assigned_to = (select public.current_employee_id())
     and t.archived_at is null
   order by t.due_date
$$;

create function public.update_task_progress(p_task_id uuid, p_status public.task_status, p_remark text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_employee_id());
  v_old public.task_status;
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
  if char_length(v_remark) > 1000 then
    raise exception 'remark too long' using errcode = '22023';
  end if;
  select status into v_old from public.tasks
   where id = p_task_id and assigned_to = v_me and archived_at is null
   for update;
  if not found then raise exception 'task not found' using errcode = '42501'; end if;

  update public.tasks
     set status = p_status,
         started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
         completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) end,
         updated_at = now()
   where id = p_task_id;

  if v_old is distinct from p_status or v_remark is not null then
    insert into public.task_progress_updates (task_id, author_id, from_status, to_status, remark)
    values (p_task_id, v_me, v_old, p_status, v_remark);
  end if;
end $$;

-- -------------------------------------------------------------- announcements
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id), -- null = company-wide
  author_id uuid not null references public.employees (id),
  title text not null check (char_length(title) between 5 and 150),
  body text not null,
  category text not null check (category in ('hr_benefits', 'it_security', 'company_news', 'facilities')),
  tag text,
  issued_by text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create index announcements_feed_idx on public.announcements (status, published_at desc);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
create policy "announcements_select_visible" on public.announcements for select to authenticated
  using (
    status = 'published' and published_at <= now()
    and (department_id is null or department_id = (select public.current_department_id()))
  );

-- ---------------------------------------------------------------------- leave
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_annual_days numeric(5, 1),
  requires_document boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.leave_types (code, name, default_annual_days, sort_order) values
  ('vacation', 'Annual Leave', 15, 1),
  ('sick', 'Sick Leave', 10, 2),
  ('personal', 'Personal Leave', 3, 3),
  ('emergency', 'Emergency Leave', 3, 4);

create sequence public.leave_request_code_seq start 10001;

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique
    default 'REQ-' || nextval('public.leave_request_code_seq')::text,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  working_days numeric(4, 1) not null check (working_days > 0),
  reason text not null check (char_length(reason) between 10 and 300),
  status public.leave_status not null default 'pending',
  approver_id uuid references public.employees (id),
  decided_by uuid references public.employees (id),
  decided_at timestamptz,
  manager_remarks text check (char_length(manager_remarks) <= 1000),
  attachment_path text,
  attachment_name text,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  constraint leave_requests_no_overlap exclude using gist (
    employee_id with =, daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);

alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
revoke all on public.leave_types, public.leave_requests from anon, authenticated;
grant select on public.leave_types, public.leave_requests to authenticated;
create policy "leave_types_select_active" on public.leave_types for select to authenticated
  using (is_active);
create policy "leave_requests_select_own" on public.leave_requests for select to authenticated
  using (employee_id = (select public.current_employee_id()));

create function public.count_working_days(p_start date, p_end date)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from generate_series(p_start, p_end, interval '1 day') d
   where extract(isodow from d) < 6
$$;

create function public.submit_leave_request(
  p_leave_type_id uuid, p_start date, p_end date, p_reason text,
  p_client_request_id uuid, p_attachment_path text default null, p_attachment_name text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_employee_id());
  v_days integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_code text;
begin
  if v_me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.leave_types where id = p_leave_type_id and is_active) then
    raise exception 'invalid leave type' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 60 then
    raise exception 'invalid dates' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 10 and 300 then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if p_attachment_path is not null
     and split_part(p_attachment_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'invalid attachment' using errcode = '42501';
  end if;
  v_days := public.count_working_days(p_start, p_end);
  if v_days = 0 then raise exception 'no working days' using errcode = '22023'; end if;

  insert into public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, working_days, reason,
     approver_id, attachment_path, attachment_name, client_request_id)
  select v_me, p_leave_type_id, p_start, p_end, v_days, v_reason,
         e.approver_id, p_attachment_path, left(p_attachment_name, 200), p_client_request_id
    from public.employees e where e.id = v_me
  returning request_code into v_code;
  return v_code;
end $$;

-- --------------------------------------------------------------- RPC grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_approver()',
    'public.update_own_profile(text, text)',
    'public.my_tasks()',
    'public.update_task_progress(uuid, public.task_status, text)',
    'public.count_working_days(date, date)',
    'public.submit_leave_request(uuid, date, date, text, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ----------------------------------------------------- leave document storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-documents', 'leave-documents', false, 5242880,
        array['application/pdf', 'image/png', 'image/jpeg']);

create policy "leave_documents_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-documents'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "leave_documents_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'leave-documents'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
