-- Portal hardening. Apply after 20261014030000_activation_safety.sql.
-- Existing data is never rewritten: invalid legacy rows fail validation and must
-- be reviewed before deployment. Original RPC signatures remain compatible.
-- Provisional rule: a designated approver is a different same-department manager.
-- Provisioning may precede activation; submitting/deciding leave requires activation.
-- Rollback: restore prior function/policy definitions only after reviewing the
-- security implications; do not drop this migration's constraints casually.

begin;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.employees where user_id = (select auth.uid())
    and account_status = 'active' and setup_completed_at is not null
    and employment_status in ('active', 'on_leave')
$$;
create or replace function public.current_department_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select department_id from public.employees where id = public.current_employee_id()
$$;
create or replace function public.managed_department_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select department_id from public.employees where id = public.current_employee_id()
    and role = 'department_manager'
$$;
create function public.portal_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.employees where id = public.current_employee_id() and role = 'employee'
$$;

-- Only this narrow bootstrap RPC is available before first-time setup.
create function public.session_profile()
returns table(role public.app_role, first_name text, account_status public.account_status,
              setup_completed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.role, e.first_name, e.account_status, e.setup_completed_at
  from public.employees e where e.user_id = (select auth.uid())
    and e.account_status in ('invited', 'active')
    and e.employment_status in ('active', 'on_leave')
$$;
revoke all on public.employees from authenticated;
grant select (id, user_id, employee_code, email, first_name, last_name, role, username,
  account_status, invited_at, activated_at, setup_completed_at, created_at, updated_at,
  department_id, position, job_level, employment_type, employment_status, hire_date,
  phone, office_location, approver_id, avatar_path) on public.employees to authenticated;
alter policy "employees_select_own" on public.employees
  using (id = (select public.current_employee_id()));

alter policy "announcements_select_visible" on public.announcements
  using ((select public.current_employee_id()) is not null
    and status = 'published' and published_at <= now()
    and (department_id is null or department_id = (select public.current_department_id())));
alter policy "leave_requests_select_managed_department" on public.leave_requests
  using (approver_id = (select public.current_employee_id())
    and (select public.is_in_managed_department(employee_id)));
alter policy "leave_types_select_active" on public.leave_types
  using ((select public.current_employee_id()) is not null and (is_active or exists (
    select 1 from public.leave_requests r where r.leave_type_id = leave_types.id)));

alter table public.departments add constraint departments_code_normalized
  check (code ~ '^[A-Z][A-Z0-9]{1,15}$');
alter table public.attendance_records add constraint attendance_time_pair
  check (time_out is null or (time_in is not null and time_out > time_in));
alter table public.attendance_records add constraint attendance_status_times
  check ((status in ('present', 'late') and time_in is not null)
    or (status not in ('present', 'late') and time_in is null and time_out is null));
alter table public.tasks alter column department_id set not null;
alter table public.tasks add constraint task_status_times
  check ((status = 'completed') = (completed_at is not null)
    and (status = 'todo' or started_at is not null)
    and (status <> 'todo' or started_at is null)
    and (completed_at is null or started_at is null or completed_at >= started_at));
alter table public.leave_requests add constraint leave_decision_consistent
  check ((status in ('approved', 'rejected') and decided_by is not null and decided_at is not null
          and decided_by = approver_id and decided_by <> employee_id)
    or (status in ('pending', 'cancelled') and decided_by is null and decided_at is null));
alter table public.leave_requests add constraint leave_rejection_remarks
  check (status <> 'rejected' or nullif(btrim(manager_remarks), '') is not null);
alter table public.leave_requests add constraint leave_approver_not_self
  check (approver_id is not null and approver_id <> employee_id);
alter table public.leave_requests add constraint leave_attachment_pair
  check ((attachment_path is null) = (attachment_name is null));
alter table public.announcements add constraint announcement_attachment_pair
  check ((attachment_path is null) = (attachment_name is null));
alter table public.announcements add constraint announcement_body_length
  check (char_length(btrim(body)) between 20 and 10000);
alter table public.announcements add constraint announcement_title_length
  check (char_length(btrim(title)) between 5 and 100);

-- A single lock serializes relationship/reference writes, including trusted
-- provisioning and storage deletes. Transactions encountering a deadlock must
-- retry; PostgreSQL aborts one writer rather than admitting an inconsistent state.
create function public.lock_portal_integrity()
returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(731014, 40000)
$$;
create function public.portal_integrity_lock_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_portal_integrity();
  return null;
end $$;
create trigger employees_integrity_lock before insert or update or delete on public.employees
  for each statement execute function public.portal_integrity_lock_trigger();
create trigger tasks_integrity_lock before insert or update or delete on public.tasks
  for each statement execute function public.portal_integrity_lock_trigger();
create trigger leave_integrity_lock before insert or update or delete on public.leave_requests
  for each statement execute function public.portal_integrity_lock_trigger();
create trigger announcements_integrity_lock before insert or update or delete on public.announcements
  for each statement execute function public.portal_integrity_lock_trigger();
create trigger storage_portal_integrity_lock before update or delete on storage.objects
  for each statement execute function public.portal_integrity_lock_trigger();

create function public.assert_portal_relationships()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.employees e left join public.employees a on a.id = e.approver_id
    where e.department_id is null or (e.role = 'employee' and e.approver_id is null)
      or (e.approver_id is not null and
      (a.role <> 'department_manager' or a.department_id is distinct from e.department_id or a.id = e.id))) then
    raise exception 'employee department or designated approver is invalid' using errcode = '23514';
  end if;
  if exists (select 1 from public.tasks t join public.employees e on e.id = t.assigned_to
    where t.archived_at is null and (e.role <> 'employee' or e.department_id is distinct from t.department_id
      )) then
    raise exception 'archive or reassign tasks before changing employee role or department' using errcode = '23514';
  end if;
  if exists (select 1 from public.leave_requests r join public.employees e on e.id = r.employee_id
    left join public.employees a on a.id = r.approver_id where r.status = 'pending' and
    (e.role <> 'employee' or a.id is null
      or a.role <> 'department_manager' or a.department_id is distinct from e.department_id
      or a.id = e.id
      or r.approver_id is distinct from e.approver_id)) then
    raise exception 'reroute pending leave before changing employee or approver relationships' using errcode = '23514';
  end if;
end $$;
create function public.portal_relationship_constraint_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_relationships();
  return null;
end $$;
create constraint trigger employees_relationships after insert or update or delete on public.employees
  deferrable initially deferred for each row execute function public.portal_relationship_constraint_trigger();
create constraint trigger tasks_relationships after insert or update or delete on public.tasks
  deferrable initially deferred for each row execute function public.portal_relationship_constraint_trigger();
create constraint trigger leave_relationships after insert or update or delete on public.leave_requests
  deferrable initially deferred for each row execute function public.portal_relationship_constraint_trigger();
select public.assert_portal_relationships();

-- Eligibility is enforced for NEW assignments, not historical rows. Disabling an
-- account is immediate even when work remains; trusted operators may reroute it.
create function public.task_assignee_eligibility_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.employees c where c.id = new.created_by
      and c.role = 'department_manager' and c.department_id = new.department_id) then
      raise exception 'task creator must be a department manager' using errcode = '23514';
    end if;
  elsif new.created_by is distinct from old.created_by then
    raise exception 'task creator is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.assigned_to = old.assigned_to and new.department_id = old.department_id
      and not (old.archived_at is not null and new.archived_at is null) then return new; end if;
  end if;
  if new.archived_at is null and not exists (select 1 from public.employees e
    where e.id = new.assigned_to and e.role = 'employee' and e.department_id = new.department_id
      and e.account_status = 'active' and e.setup_completed_at is not null
      and e.employment_status = 'active') then
    raise exception 'active onboarded employee assignee required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger task_assignee_eligible before insert or update on public.tasks
  for each row execute function public.task_assignee_eligibility_trigger();

create function public.leave_participant_eligibility_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.employee_id = old.employee_id
      and new.approver_id = old.approver_id then return new; end if;
  end if;
  if not exists (select 1 from public.employees e join public.employees a on a.id = new.approver_id
    where e.id = new.employee_id and e.role = 'employee' and e.account_status = 'active'
      and e.setup_completed_at is not null and e.employment_status in ('active', 'on_leave')
      and a.id <> e.id and a.role = 'department_manager' and a.department_id = e.department_id
      and a.account_status = 'active' and a.setup_completed_at is not null
      and a.employment_status in ('active', 'on_leave')) then
    raise exception 'active employee and designated manager required' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger leave_participants_eligible before insert or update on public.leave_requests
  for each row execute function public.leave_participant_eligibility_trigger();

create function public.valid_portal_object_path(p_path text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9_.-]{1,100}$', false)
$$;

-- Actual object existence plus owner folder is checked inside the same lock used
-- by DELETE. Service-role writes must also preserve valid object references.
create function public.portal_attachment_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bucket text; v_owner uuid; v_required boolean;
begin
  if tg_table_name = 'leave_requests' then
    if tg_op = 'UPDATE' and new.attachment_path is not distinct from old.attachment_path
      and new.employee_id = old.employee_id and new.leave_type_id = old.leave_type_id then return new; end if;
    v_bucket := 'leave-documents';
    select user_id into v_owner from public.employees where id = new.employee_id;
    select requires_document into v_required from public.leave_types where id = new.leave_type_id;
    if v_required and new.attachment_path is null then
      raise exception 'supporting document required' using errcode = '22023';
    end if;
  else
    v_bucket := 'announcement-files';
    -- Existing attachments may be retained when another authorized manager edits.
    if tg_op = 'UPDATE' and new.attachment_path is not distinct from old.attachment_path then return new; end if;
    v_owner := auth.uid();
    if v_owner is null then
      select user_id into v_owner from public.employees where id = new.author_id;
    end if;
  end if;
  if new.attachment_path is not null and (v_owner is null
    or not public.valid_portal_object_path(new.attachment_path)
    or split_part(new.attachment_path, '/', 1) <> v_owner::text
    or not exists (select 1 from storage.objects o
      where o.bucket_id = v_bucket and o.name = new.attachment_path
        and o.owner_id = v_owner::text)) then
    raise exception 'attachment must be an existing owned object' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger leave_attachment_validate before insert or update on public.leave_requests
  for each row execute function public.portal_attachment_trigger();
create trigger announcement_attachment_validate before insert or update on public.announcements
  for each row execute function public.portal_attachment_trigger();

do $$
begin
  if exists (select 1 from (
    select 'leave-documents'::text bucket_id, attachment_path from public.leave_requests
    union all select 'announcement-files', attachment_path from public.announcements
  ) refs where attachment_path is not null and
    (not public.valid_portal_object_path(attachment_path) or not exists (
      select 1 from storage.objects o where o.bucket_id = refs.bucket_id and o.name = refs.attachment_path
        and o.owner_id = split_part(refs.attachment_path, '/', 1)))) then
    raise exception 'legacy attachment references require review' using errcode = '23514';
  end if;
end $$;

create function public.portal_storage_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.bucket_id = old.bucket_id and new.name = old.name
      and new.owner_id is not distinct from old.owner_id then return new; end if;
  end if;
  if (old.bucket_id = 'leave-documents' and exists
        (select 1 from public.leave_requests where attachment_path = old.name))
    or (old.bucket_id = 'announcement-files' and exists
        (select 1 from public.announcements where attachment_path = old.name)) then
    raise exception 'cannot delete a referenced portal attachment' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end $$;
create trigger portal_storage_delete_guard before update or delete on storage.objects
  for each row execute function public.portal_storage_delete_guard();

update storage.buckets set public = false where id in ('leave-documents', 'announcement-files');
drop policy "leave_documents_insert_own" on storage.objects;
drop policy "leave_documents_select_own" on storage.objects;
drop policy "leave_documents_select_managed_department" on storage.objects;
drop policy "announcement_files_insert_manager" on storage.objects;
drop policy "announcement_files_select_visible" on storage.objects;
create policy "leave_documents_insert_eligible" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-documents' and (select public.portal_employee_id()) is not null
    and public.valid_portal_object_path(name)
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text);
create policy "leave_documents_select_owner_or_approver" on storage.objects for select to authenticated
  using (bucket_id = 'leave-documents' and (select public.current_employee_id()) is not null
    and ((owner_id = (select auth.uid())::text and (storage.foldername(name))[1] = (select auth.uid())::text)
      or exists (select 1 from public.leave_requests r where r.attachment_path = name
        and r.approver_id = (select public.current_employee_id())
        and (select public.is_in_managed_department(r.employee_id)))));
create policy "announcement_files_insert_eligible" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files' and (select public.managed_department_id()) is not null
    and public.valid_portal_object_path(name)
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text);
create policy "announcement_files_select_visible_or_own" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files' and (select public.current_employee_id()) is not null
    and ((owner_id = (select auth.uid())::text and (storage.foldername(name))[1] = (select auth.uid())::text)
      or exists (select 1 from public.announcements a where a.attachment_path = name)));
create function public.portal_object_unreferenced(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_name
    and o.owner_id = (select auth.uid())::text
    and split_part(o.name, '/', 1) = (select auth.uid())::text)
    and public.current_employee_id() is not null and case when p_bucket = 'leave-documents' then
    not exists (select 1 from public.leave_requests where attachment_path = p_name)
    when p_bucket = 'announcement-files' then
    not exists (select 1 from public.announcements where attachment_path = p_name)
    else false end
$$;
alter policy "announcement_files_select_visible_or_own" on storage.objects
  using (bucket_id = 'announcement-files' and (select public.current_employee_id()) is not null
    and ((owner_id = (select auth.uid())::text and (storage.foldername(name))[1] = (select auth.uid())::text
      and public.portal_object_unreferenced(bucket_id, name))
      or exists (select 1 from public.announcements a where a.attachment_path = name)));
create policy "portal_files_delete_unreferenced_own" on storage.objects for delete to authenticated
  using (bucket_id in ('leave-documents', 'announcement-files')
    and (select public.current_employee_id()) is not null
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.portal_object_unreferenced(bucket_id, name));

-- Replaced RPC definitions follow; new helper functions are explicitly locked down.


create or replace function public.update_own_profile(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  perform public.lock_portal_integrity();
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
   where id = (select public.portal_employee_id());
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

create or replace function public.my_tasks()
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
   where t.assigned_to = (select public.portal_employee_id())
     and t.archived_at is null
   order by t.due_date
$$;

create or replace function public.update_task_progress(p_task_id uuid, p_status public.task_status, p_remark text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_old public.task_status;
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
  perform public.lock_portal_integrity();
  v_me := public.portal_employee_id();
  if p_status is null then raise exception 'invalid status or priority' using errcode = '22023'; end if;
  if char_length(v_remark) > 1000 then
    raise exception 'remark too long' using errcode = '22023';
  end if;
  select status into v_old from public.tasks
   where id = p_task_id and assigned_to = v_me and archived_at is null
   for update;
  if not found then raise exception 'task not found' using errcode = '42501'; end if;

  update public.tasks
     set status = p_status,
         started_at = case when p_status in ('in_progress', 'completed') then coalesce(started_at, now()) end,
         completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) end,
         updated_at = now()
   where id = p_task_id;

  if v_old is distinct from p_status or v_remark is not null then
    insert into public.task_progress_updates (task_id, author_id, from_status, to_status, remark)
    values (p_task_id, v_me, v_old, p_status, v_remark);
  end if;
end $$;

create or replace function public.create_department_task(
  p_assigned_to uuid, p_title text, p_description text, p_due_date date,
  p_priority public.task_priority, p_status public.task_status
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_dept uuid;
  v_me uuid;
  v_prefix text;
  v_next integer;
  v_code text;
begin
  perform public.lock_portal_integrity();
  v_me := public.current_employee_id();
  v_dept := public.managed_department_id();
  if v_dept is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees e where e.id = p_assigned_to
    and e.department_id = v_dept and e.role = 'employee' and e.account_status = 'active'
    and e.setup_completed_at is not null and e.employment_status = 'active') then
    raise exception 'assignee outside department' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 150
     or char_length(coalesce(p_description, '')) > 5000
     or p_due_date is null or p_due_date < current_date
     or p_status is null or p_priority is null or p_status = 'completed' then
    raise exception 'invalid task' using errcode = '22023';
  end if;

  select upper(code) into v_prefix from public.departments where id = v_dept;
  perform pg_advisory_xact_lock(hashtext('task_code:' || v_dept::text));
  select coalesce(max(substring(task_code from '(\d+)$')::integer), 4100) + 1 into v_next
    from public.tasks where department_id = v_dept and left(task_code, char_length(v_prefix) + 1) = v_prefix || '-'
      and substring(task_code from char_length(v_prefix) + 2) ~ '^[0-9]+$';
  v_code := v_prefix || '-' || v_next;

  insert into public.tasks
    (task_code, department_id, title, description, assigned_to, created_by,
     due_date, priority, status, started_at)
  values
    (v_code, v_dept, btrim(p_title), nullif(btrim(p_description), ''), p_assigned_to, v_me,
     p_due_date, p_priority, p_status, case when p_status = 'in_progress' then now() end);
  return v_code;
end $$;

create or replace function public.manager_update_task(
  p_task_id uuid, p_status public.task_status, p_priority public.task_priority,
  p_due_date date, p_remark text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.task_status;
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
  perform public.lock_portal_integrity();
  if p_status is null or p_priority is null then raise exception 'invalid status or priority' using errcode = '22023'; end if;
  if char_length(v_remark) > 1000 or p_due_date is null then
    raise exception 'invalid update' using errcode = '22023';
  end if;
  select status into v_old from public.tasks
   where id = p_task_id and department_id = (select public.managed_department_id())
     and archived_at is null
   for update;
  if not found then raise exception 'task not found' using errcode = '42501'; end if;

  update public.tasks
     set status = p_status, priority = p_priority, due_date = p_due_date,
         started_at = case when p_status in ('in_progress', 'completed') then coalesce(started_at, now()) end,
         completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) end,
         updated_at = now()
   where id = p_task_id;

  if v_old is distinct from p_status or v_remark is not null then
    insert into public.task_progress_updates (task_id, author_id, from_status, to_status, remark)
    values (p_task_id, (select public.current_employee_id()), v_old, p_status, v_remark);
  end if;
end $$;

create or replace function public.archive_department_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_portal_integrity();
  update public.tasks set archived_at = now(), updated_at = now()
   where id = p_task_id and department_id = (select public.managed_department_id())
     and archived_at is null;
  if not found then raise exception 'task not found' using errcode = '42501'; end if;
end $$;

create or replace function public.decide_leave_request(
  p_request_id uuid, p_decision public.leave_status, p_remarks text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_req public.leave_requests%rowtype;
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  perform public.lock_portal_integrity();
  v_me := public.current_employee_id();
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_remarks is null then
    raise exception 'remarks required' using errcode = '22023';
  end if;
  if char_length(v_remarks) > 1000 then
    raise exception 'remarks too long' using errcode = '22023';
  end if;

  select * into v_req from public.leave_requests where id = p_request_id for update;
  if not found or not public.is_in_managed_department(v_req.employee_id) or v_req.employee_id = v_me or v_req.approver_id is distinct from v_me
    or not exists (select 1 from public.employees e where e.id = v_req.employee_id
      and e.role = 'employee' and e.account_status = 'active' and e.setup_completed_at is not null
      and e.employment_status in ('active', 'on_leave')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already decided' using errcode = '55000';
  end if;

  update public.leave_requests
     set status = p_decision, decided_by = v_me, decided_at = now(), manager_remarks = v_remarks
   where id = p_request_id;
end $$;

-- Replace, rather than overload, the RPC so PostgREST has one unambiguous target.
-- Seven-argument callers keep content-only/create compatibility via the default;
-- replacement of an existing attachment requires its last observed path.
drop function public.save_department_announcement(uuid, text, text, text, text, text, text);
create function public.save_department_announcement(
  p_id uuid, p_title text, p_body text, p_category text, p_status text,
  p_attachment_path text default null, p_attachment_name text default null,
  p_expected_attachment_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dept uuid;
  v_id uuid;
  v_existing_attachment text;
begin
  perform public.lock_portal_integrity();
  v_dept := public.managed_department_id();
  if v_dept is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('draft', 'published')
     or char_length(btrim(coalesce(p_title, ''))) not between 5 and 100
     or char_length(btrim(coalesce(p_body, ''))) not between 20 and 10000 then
    raise exception 'invalid announcement' using errcode = '22023';
  end if;
  if p_attachment_path is not null
     and split_part(p_attachment_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'invalid attachment' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.announcements
      (department_id, author_id, title, body, category, status, published_at,
       issued_by, attachment_path, attachment_name)
    select v_dept, e.id, btrim(p_title), btrim(p_body), p_category, p_status,
           case when p_status = 'published' then now() end,
           e.first_name || ' ' || e.last_name || coalesce(' (' || e.position || ')', ''),
           p_attachment_path, left(p_attachment_name, 200)
      from public.employees e where e.id = (select public.current_employee_id())
    returning id into v_id;
  else
    select attachment_path into v_existing_attachment from public.announcements
      where id = p_id and department_id = v_dept for update;
    if not found then raise exception 'not found' using errcode = '42501'; end if;
    if p_attachment_path is not null
      and v_existing_attachment is distinct from p_expected_attachment_path then
      raise exception 'announcement attachment changed; reload before replacing it' using errcode = '55000';
    end if;
    if p_attachment_path is not null and v_existing_attachment is not null
      and p_attachment_path is distinct from v_existing_attachment
      and split_part(v_existing_attachment, '/', 1) <> (select auth.uid())::text then
      raise exception 'only the attachment owner may replace it' using errcode = '42501';
    end if;
    update public.announcements
       set title = btrim(p_title), body = btrim(p_body), category = p_category, status = p_status,
           published_at = case when p_status = 'published' then coalesce(published_at, now()) end,
           attachment_path = coalesce(p_attachment_path, attachment_path),
           attachment_name = case when p_attachment_path is null then attachment_name else left(p_attachment_name, 200) end,
           updated_at = now()
     where id = p_id and department_id = v_dept
    returning id into v_id;
    if v_id is null then raise exception 'not found' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.count_working_days(p_start date, p_end date)
returns integer language sql immutable set search_path = '' as $$
  select case when p_start is null or p_end is null or p_end < p_start or p_end - p_start > 60
    then 0 else (select count(*)::integer from generate_series(0, p_end - p_start) d
      where extract(isodow from p_start + d) < 6) end
$$;

alter table public.leave_requests add constraint leave_working_days_consistent
  check (working_days = public.count_working_days(start_date, end_date));

create or replace function public.submit_leave_request(
  p_leave_type_id uuid, p_start date, p_end date, p_reason text,
  p_client_request_id uuid, p_attachment_path text default null, p_attachment_name text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_approver uuid;
  v_days integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_code text;
  v_existing public.leave_requests%rowtype;
begin
  perform public.lock_portal_integrity();
  v_me := public.portal_employee_id();
  if v_me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'request key required' using errcode = '22023'; end if;
  select * into v_existing from public.leave_requests where client_request_id = p_client_request_id;
  if found then
    if v_existing.employee_id <> v_me then raise exception 'request key unavailable' using errcode = '42501'; end if;
    if v_existing.leave_type_id is distinct from p_leave_type_id
      or v_existing.start_date is distinct from p_start or v_existing.end_date is distinct from p_end
      or v_existing.reason is distinct from v_reason then
      raise exception 'request key reused with different details' using errcode = '22023';
    end if;
    -- A retry never replaces the first submission's supporting document.
    return v_existing.request_code;
  end if;
  if not exists (select 1 from public.leave_types where id = p_leave_type_id and is_active) then
    raise exception 'invalid leave type' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 60 then
    raise exception 'invalid dates' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 10 and 300 then raise exception 'invalid reason' using errcode = '22023'; end if;
  select a.id into v_approver from public.employees e join public.employees a on a.id = e.approver_id
    where e.id = v_me and a.id <> e.id and a.role = 'department_manager'
      and a.department_id = e.department_id and a.account_status = 'active'
      and a.setup_completed_at is not null and a.employment_status in ('active', 'on_leave');
  if v_approver is null then raise exception 'active designated approver required' using errcode = '42501'; end if;
  v_days := public.count_working_days(p_start, p_end);
  if v_days = 0 then raise exception 'no working days' using errcode = '22023'; end if;
  insert into public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, working_days, reason,
     approver_id, attachment_path, attachment_name, client_request_id)
  values (v_me, p_leave_type_id, p_start, p_end, v_days, v_reason,
    v_approver, p_attachment_path, left(p_attachment_name, 200), p_client_request_id)
  returning request_code into v_code;
  return v_code;
end $$;

-- Internal functions are not client RPCs. Existing replaced RPC grants persist.
revoke execute on function public.lock_portal_integrity() from public, anon, authenticated;
revoke execute on function public.portal_integrity_lock_trigger() from public, anon, authenticated;
revoke execute on function public.assert_portal_relationships() from public, anon, authenticated;
revoke execute on function public.portal_relationship_constraint_trigger() from public, anon, authenticated;
revoke execute on function public.portal_attachment_trigger() from public, anon, authenticated;
revoke execute on function public.portal_storage_delete_guard() from public, anon, authenticated;
revoke execute on function public.task_assignee_eligibility_trigger() from public, anon, authenticated;
revoke execute on function public.leave_participant_eligibility_trigger() from public, anon, authenticated;
revoke execute on function public.valid_portal_object_path(text) from public, anon;
revoke execute on function public.portal_employee_id() from public, anon;
revoke execute on function public.session_profile() from public, anon;
revoke execute on function public.portal_object_unreferenced(text, text) from public, anon;
revoke execute on function public.count_working_days(date, date) from public, anon, authenticated;
revoke execute on function public.save_department_announcement(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.portal_employee_id() to authenticated;
grant execute on function public.session_profile() to authenticated;
grant execute on function public.portal_object_unreferenced(text, text) to authenticated;
grant execute on function public.save_department_announcement(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.valid_portal_object_path(text) to authenticated;
grant execute on function public.lock_portal_integrity() to service_role;
grant execute on function public.count_working_days(date, date) to service_role;

commit;
