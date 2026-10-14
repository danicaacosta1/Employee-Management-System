-- Manual after auth_only.sql and explicit approval. Assigned IDs: EMS-0001 (manager), EMS-0002 (employee).
-- No Auth users/passwords/invitations/emails are created or updated.
begin;
do $$ declare p record; existing public.employees%rowtype; begin
for p in select * from (values
(current_setting('ems.provision_manager_code',true),'danicaacosta544@gmail.com','department_manager'::public.app_role,'Danica','Acosta'),
(current_setting('ems.provision_employee_code',true),'margaretsubong92@gmail.com','employee'::public.app_role,'Margaret','Subong')
) as profiles(code,email,role,first_name,last_name) loop
if coalesce(p.code,'') !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
raise exception 'Employee IDs pending: supply approved distinct uppercase employee codes'; end if;
if (select count(*) from public.employees where email=p.email or employee_code=p.code)>1 then
raise exception 'Code and email refer to different profiles'; end if;
select * into existing from public.employees where email=p.email or employee_code=p.code for update;
if found then
if existing.email<>p.email or existing.employee_code<>p.code or existing.role<>p.role then
raise exception 'Existing profile differs: explicit reconciliation required'; end if;
else
insert into public.employees(employee_code,email,role,first_name,last_name)
values(p.code,p.email,p.role,p.first_name,p.last_name);
end if;
end loop; end $$;
commit;
