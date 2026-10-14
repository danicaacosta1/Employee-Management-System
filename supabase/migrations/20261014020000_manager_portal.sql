-- Department manager portal. Depends on 20261014000000_auth_employees.sql and
-- 20261014010000_employee_portal.sql. Reuses the same tables; adds manager
-- read policies and security-definer RPCs for every manager write.
-- A manager manages the department on their own employees row.

-- --------------------------------------------------------------------- helper
create function public.managed_department_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select department_id from public.employees
   where user_id = (select auth.uid())
     and role = 'department_manager'
     and account_status <> 'disabled'
$$;
revoke execute on function public.managed_department_id() from public, anon;
grant execute on function public.managed_department_id() to authenticated;

create function public.is_in_managed_department(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees
     where id = p_employee_id
       and department_id = (select public.managed_department_id())
  )
$$;
revoke execute on function public.is_in_managed_department(uuid) from public, anon;
grant execute on function public.is_in_managed_department(uuid) to authenticated;

-- ------------------------------------------------------- manager read access
create policy "employees_select_managed_department" on public.employees for select to authenticated
  using (department_id = (select public.managed_department_id()));

create policy "attendance_select_managed_department" on public.attendance_records for select to authenticated
  using ((select public.is_in_managed_department(employee_id)));

create policy "tasks_select_managed_department" on public.tasks for select to authenticated
  using (department_id = (select public.managed_department_id()));

create policy "task_progress_select_managed_department" on public.task_progress_updates for select to authenticated
  using (exists (select 1 from public.tasks t
                  where t.id = task_id and t.department_id = (select public.managed_department_id())));

create policy "leave_requests_select_managed_department" on public.leave_requests for select to authenticated
  using ((select public.is_in_managed_department(employee_id)));

create policy "announcements_select_managed_department" on public.announcements for select to authenticated
  using (department_id = (select public.managed_department_id()));

create index tasks_department_idx on public.tasks (department_id, status, due_date);
create index announcements_department_idx on public.announcements (department_id, status, published_at desc);

-- ----------------------------------------------- announcement categories/files
alter table public.announcements drop constraint announcements_category_check;
alter table public.announcements add constraint announcements_category_check check (category in (
  'hr_benefits', 'it_security', 'company_news', 'facilities',
  'sprint_notices', 'technical_guidelines', 'team_events', 'operational'
));
alter table public.announcements
  add column attachment_path text,
  add column attachment_name text;

-- ----------------------------------------------------------------------- tasks
create function public.create_department_task(
  p_assigned_to uuid, p_title text, p_description text, p_due_date date,
  p_priority public.task_priority, p_status public.task_status
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_dept uuid := (select public.managed_department_id());
  v_me uuid := (select public.current_employee_id());
  v_prefix text;
  v_next integer;
  v_code text;
begin
  if v_dept is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not public.is_in_managed_department(p_assigned_to) then
    raise exception 'assignee outside department' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 150
     or char_length(coalesce(p_description, '')) > 5000
     or p_due_date is null or p_due_date < current_date
     or p_status = 'completed' then
    raise exception 'invalid task' using errcode = '22023';
  end if;

  select upper(code) into v_prefix from public.departments where id = v_dept;
  perform pg_advisory_xact_lock(hashtext('task_code:' || v_dept::text));
  select coalesce(max(substring(task_code from '(\d+)$')::integer), 4100) + 1 into v_next
    from public.tasks where task_code like v_prefix || '-%';
  v_code := v_prefix || '-' || v_next;

  insert into public.tasks
    (task_code, department_id, title, description, assigned_to, created_by,
     due_date, priority, status, started_at)
  values
    (v_code, v_dept, btrim(p_title), nullif(btrim(p_description), ''), p_assigned_to, v_me,
     p_due_date, p_priority, p_status, case when p_status = 'in_progress' then now() end);
  return v_code;
end $$;

-- Manager review: status, priority, due date and an optional remark.
create function public.manager_update_task(
  p_task_id uuid, p_status public.task_status, p_priority public.task_priority,
  p_due_date date, p_remark text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.task_status;
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
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
         started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
         completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) end,
         updated_at = now()
   where id = p_task_id;

  if v_old is distinct from p_status or v_remark is not null then
    insert into public.task_progress_updates (task_id, author_id, from_status, to_status, remark)
    values (p_task_id, (select public.current_employee_id()), v_old, p_status, v_remark);
  end if;
end $$;

create function public.archive_department_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set archived_at = now(), updated_at = now()
   where id = p_task_id and department_id = (select public.managed_department_id())
     and archived_at is null;
  if not found then raise exception 'task not found' using errcode = '42501'; end if;
end $$;

-- ----------------------------------------------------------------------- leave
create function public.decide_leave_request(
  p_request_id uuid, p_decision public.leave_status, p_remarks text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_employee_id());
  v_req public.leave_requests%rowtype;
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_remarks is null then
    raise exception 'remarks required' using errcode = '22023';
  end if;
  if char_length(v_remarks) > 1000 then
    raise exception 'remarks too long' using errcode = '22023';
  end if;

  select * into v_req from public.leave_requests where id = p_request_id for update;
  if not found or not public.is_in_managed_department(v_req.employee_id) or v_req.employee_id = v_me then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already decided' using errcode = '55000';
  end if;

  update public.leave_requests
     set status = p_decision, decided_by = v_me, decided_at = now(), manager_remarks = v_remarks
   where id = p_request_id;
end $$;

-- --------------------------------------------------------------- announcements
-- Create (p_id null) or edit a department announcement. p_status: draft | published.
create function public.save_department_announcement(
  p_id uuid, p_title text, p_body text, p_category text, p_status text,
  p_attachment_path text default null, p_attachment_name text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dept uuid := (select public.managed_department_id());
  v_id uuid;
begin
  if v_dept is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('draft', 'published')
     or char_length(btrim(coalesce(p_title, ''))) not between 5 and 150
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
    update public.announcements
       set title = btrim(p_title), body = btrim(p_body), category = p_category, status = p_status,
           published_at = case when p_status = 'published' then coalesce(published_at, now()) end,
           attachment_path = coalesce(p_attachment_path, attachment_path),
           attachment_name = coalesce(left(p_attachment_name, 200), attachment_name),
           updated_at = now()
     where id = p_id and department_id = v_dept
    returning id into v_id;
    if v_id is null then raise exception 'not found' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

-- --------------------------------------------------------------- RPC grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_department_task(uuid, text, text, date, public.task_priority, public.task_status)',
    'public.manager_update_task(uuid, public.task_status, public.task_priority, date, text)',
    'public.archive_department_task(uuid)',
    'public.decide_leave_request(uuid, public.leave_status, text)',
    'public.save_department_announcement(uuid, text, text, text, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- --------------------------------------------------------------------- storage
-- Managers can read supporting documents filed by their department.
create policy "leave_documents_select_managed_department" on storage.objects for select to authenticated
  using (bucket_id = 'leave-documents' and exists (
    select 1 from public.employees e
     where e.user_id::text = (storage.foldername(name))[1]
       and e.department_id = (select public.managed_department_id())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-files', 'announcement-files', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg']);

create policy "announcement_files_insert_manager" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files'
              and (select public.managed_department_id()) is not null
              and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Readable by anyone who can see the announcement (announcements RLS applies).
create policy "announcement_files_select_visible" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files'
         and exists (select 1 from public.announcements a where a.attachment_path = name));
