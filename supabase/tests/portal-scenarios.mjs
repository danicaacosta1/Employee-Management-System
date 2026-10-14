// Synthetic fixtures in the caller's disposable PostgreSQL only. No Auth API,
// files, network, credentials, SMTP, or production identities are involved.
import assert from "node:assert/strict";

export async function verifyPortal({ db, query, scalar, as, denied, check }) {
  const id = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const deptA = id(800), deptB = id(801);
  const people = {
    manager: { uid: id(1), employee: id(101), role: "department_manager", dept: deptA },
    alternate: { uid: id(2), employee: id(102), role: "department_manager", dept: deptA },
    outsider: { uid: id(3), employee: id(103), role: "department_manager", dept: deptB },
    employee: { uid: id(4), employee: id(104), role: "employee", dept: deptA },
    colleague: { uid: id(5), employee: id(105), role: "employee", dept: deptA },
    invited: { uid: id(6), employee: id(106), role: "employee", dept: deptA, status: "invited", setup: false },
    disabled: { uid: id(7), employee: id(107), role: "employee", dept: deptA, status: "disabled" },
    incomplete: { uid: id(8), employee: id(108), role: "employee", dept: deptA, setup: false },
    inactive: { uid: id(9), employee: id(109), role: "employee", dept: deptA, employment: "inactive" },
  };
  const { manager, alternate, outsider, employee, colleague } = people;
  const auth = (p, work) => as("authenticated", p.uid, work);
  const path = (p, n) => `${p.uid}/${id(n)}-document.pdf`;
  const upload = (p, bucket, objectPath) => auth(p, () => query(
    "insert into storage.objects(bucket_id,name,owner_id,metadata) values ($1,$2,$3,$4)",
    [bucket, objectPath, p.uid, { mimetype: "application/pdf", size: 100 }],
  ));
  const createTaskSql = "select public.create_department_task($1,'Synthetic task','Local verification',current_date+7,'medium','todo')";
  const submitSql = "select public.submit_leave_request($1,$2,$3,$4,$5,$6,$7)";
  const saveSql = "select public.save_department_announcement($1,$2,$3,'team_events',$4,$5,$6,$7)";
  const body = "Synthetic announcement body used only for local database verification.";
  let taskId, requestId, requestCode, announcementId;
  const leavePath = path(employee, 900), firstFile = path(manager, 901);
  const replacementFile = path(manager, 902), staleFile = path(manager, 903);
  const otherManagerFile = path(alternate, 904);

  await query("insert into public.departments(id,code,name) values ($1,'QA','Synthetic QA'),($2,'QB','Synthetic QB')", [deptA, deptB]);
  for (const [name, person] of Object.entries(people)) {
    await query("insert into auth.users(id,email,email_confirmed_at,encrypted_password) values ($1,$2,now(),'synthetic-hash-not-a-real-password')", [person.uid, `${name}@portal.invalid`]);
    await query(`insert into public.employees
      (id,user_id,employee_code,email,first_name,last_name,role,department_id,approver_id,
       account_status,setup_completed_at,employment_status)
      values($1,$2,$3,$4,$5,'Synthetic',$6,$7,$8,$9,case when $10 then now() end,$11)`,
    [person.employee, person.uid, `QA-${name.toUpperCase()}`, `${name}@portal.invalid`, name,
      person.role, person.dept, person.role === "employee" ? manager.employee : null,
      person.status ?? "active", person.setup !== false, person.employment ?? "active"]);
  }
  await query("insert into auth.users(id,email,encrypted_password) values($1,'unlinked@portal.invalid','synthetic-hash')", [id(99)]);
  const leaveType = await scalar("select id from public.leave_types where code='vacation'");
  const docType = id(850);
  await query("insert into public.leave_types(id,code,name,requires_document) values($1,'synthetic_doc','Synthetic documented leave',true)", [docType]);

  await check("portal catalog has real foreign keys, exclusion and integrity triggers", async () => {
    assert.equal(await scalar("select count(*)::integer from pg_constraint where conrelid='public.tasks'::regclass and contype='f'"), 3);
    assert.equal(await scalar("select count(*)::integer from pg_constraint where conrelid='public.leave_requests'::regclass and contype='f'"), 4);
    assert.equal(await scalar("select count(*)::integer from pg_constraint where conrelid='public.leave_requests'::regclass and contype='x'"), 1);
    assert.equal(await scalar("select count(*)::integer from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal"), 2);
    assert.equal(await scalar("select count(*)::integer from pg_trigger where tgrelid='public.employees'::regclass and tgdeferrable and not tgisinternal"), 1);
  });
  await check("invited, disabled, incomplete, inactive and unlinked sessions cannot read or write portal data", async () => {
    for (const name of ["invited", "disabled", "incomplete", "inactive", "unlinked"]) {
      const person = people[name] ?? { uid: id(99) };
      await auth(person, async () => {
        assert.equal(await scalar("select public.current_employee_id()"), null);
        assert.deepEqual(await query("select id from public.employees"), []);
        assert.deepEqual(await query("select id from public.departments"), []);
        assert.deepEqual(await query("select id from public.leave_types"), []);
        assert.deepEqual(await query("select * from public.my_tasks()"), []);
        await denied("select public.update_own_profile('Synthetic Name',null)", "42501");
        await denied(createTaskSql, "42501", [employee.employee]);
        await denied("insert into storage.objects(bucket_id,name,owner_id) values('leave-documents',$1,$2)", "42501", [path(person, 990), person.uid]);
        const bootstrap = await query("select * from public.session_profile()");
        assert.equal(bootstrap.length, ["invited", "incomplete"].includes(name) ? 1 : 0);
      });
    }
    await as("anon", null, () => denied("select public.session_profile()", "42501"));
  });
  await check("employee profile and manager roster obey role and department boundaries", async () => {
    await auth(employee, async () => {
      assert.deepEqual(await query("select id from public.employees"), [{ id: employee.employee }]);
      await query("select public.update_own_profile('Synthetic Employee','+123456789')");
      await denied("update public.employees set role='department_manager' where id=$1", "42501", [employee.employee]);
      await denied("select activation_claim_token from public.employees", "42501");
      await denied(createTaskSql, "42501", [employee.employee]);
    });
    await auth(manager, async () => {
      assert.equal(await scalar("select count(*)::integer from public.employees"), 8);
      await denied("select public.update_own_profile('Synthetic Manager',null)", "42501");
      await denied(submitSql, "42501", [leaveType, "2030-01-07", "2030-01-08", "Synthetic leave reason", id(930), null, null]);
      await denied(createTaskSql, "42501", [outsider.employee]);
      await denied(createTaskSql, "42501", [manager.employee]);
      for (const name of ["invited", "disabled", "incomplete", "inactive"]) await denied(createTaskSql, "42501", [people[name].employee]);
    });
    await auth(outsider, async () => assert.deepEqual(await query("select id from public.employees"), [{ id: outsider.employee }]));
  });
  await check("attendance duration and own/department visibility execute correctly", async () => {
    await query(`insert into public.attendance_records(employee_id,work_date,status,time_in,time_out)
      values($1,current_date,'present',now(),now()+interval '8 hours')`, [employee.employee]);
    for (const person of [employee, manager, alternate]) await auth(person, async () => {
      assert.equal(await scalar("select worked_minutes from public.attendance_records where employee_id=$1", [employee.employee]), 480);
    });
    for (const person of [colleague, outsider, people.invited, people.disabled]) await auth(person, async () => {
      assert.equal(await scalar("select count(*)::integer from public.attendance_records"), 0);
    });
  });
  await check("task assignment, progress, manager review and timestamps execute successfully", async () => {
    const code = await auth(manager, () => scalar(createTaskSql, [employee.employee]));
    assert.equal(code, "QA-4101");
    taskId = await scalar("select id from public.tasks where task_code=$1", [code]);
    await query("update public.employees set employment_status='on_leave' where id=$1", [employee.employee]);
    await auth(manager, () => denied(createTaskSql, "42501", [employee.employee]));
    await auth(employee, async () => {
      assert.equal((await query("select * from public.my_tasks()"))[0].id, taskId);
      await query("select public.update_task_progress($1,'in_progress','Started locally')", [taskId]);
      await query("select public.update_task_progress($1,'completed','Done locally')", [taskId]);
    });
    await query("update public.employees set employment_status='active' where id=$1", [employee.employee]);
    assert.equal(await scalar("select started_at is not null and completed_at is not null from public.tasks where id=$1", [taskId]), true);
    const completed = await scalar("select completed_at::text from public.tasks where id=$1", [taskId]);
    await auth(employee, () => query("select public.update_task_progress($1,'completed','More detail')", [taskId]));
    assert.equal(await scalar("select completed_at::text from public.tasks where id=$1", [taskId]), completed);
    await auth(manager, () => query("select public.manager_update_task($1,'todo','high',current_date+8,'Reopened locally')", [taskId]));
    assert.equal(await scalar("select started_at is null and completed_at is null from public.tasks where id=$1", [taskId]), true);
    assert.equal(await scalar("select count(*)::integer from public.task_progress_updates where task_id=$1", [taskId]), 4);
    for (const person of [colleague, outsider]) await auth(person, async () => {
      assert.deepEqual(await query("select id from public.tasks where id=$1", [taskId]), []);
      await denied("select public.update_task_progress($1,'completed','Unauthorized')", "42501", [taskId]);
    });
    await denied("update public.tasks set status='completed' where id=$1", "23514", [taskId]);
    await denied("insert into public.attendance_records(employee_id,work_date,status,time_out) values($1,current_date,'present',now())", "23514", [employee.employee]);
    await denied("insert into public.departments(code,name) values('qa','Invalid case')", "23514");
  });
  await check("leave submission is idempotent, caller-bound and overlap protected", async () => {
    const values = [leaveType, "2030-01-07", "2030-01-08", "Synthetic leave reason", id(931), null, null];
    requestCode = await auth(employee, () => scalar(submitSql, values));
    assert.equal(await auth(employee, () => scalar(submitSql, values)), requestCode);
    requestId = await scalar("select id from public.leave_requests where request_code=$1", [requestCode]);
    assert.equal(await scalar("select working_days::integer from public.leave_requests where id=$1", [requestId]), 2);
    await auth(employee, async () => {
      await denied(submitSql, "22023", [...values.slice(0, 3), "Different synthetic reason", ...values.slice(4)]);
      await denied(submitSql, "23P01", [leaveType, "2030-01-08", "2030-01-09", "Synthetic overlapping leave", id(932), null, null]);
      await denied(submitSql, "22023", [leaveType, "2030-01-12", "2030-01-13", "Synthetic weekend leave", id(933), null, null]);
    });
    await auth(colleague, () => denied(submitSql, "42501", values));
  });
  await check("only designated manager can see and decide leave; repeated decisions fail", async () => {
    for (const person of [alternate, outsider, colleague]) await auth(person, async () => {
      assert.deepEqual(await query("select id from public.leave_requests where id=$1", [requestId]), []);
      await denied("select public.decide_leave_request($1,'approved',null)", "42501", [requestId]);
    });
    await auth(employee, () => denied("select public.decide_leave_request($1,'approved',null)", "42501", [requestId]));
    await auth(manager, async () => {
      assert.equal(await scalar("select count(*)::integer from public.leave_requests where id=$1", [requestId]), 1);
      await denied("select public.decide_leave_request($1,'rejected',null)", "22023", [requestId]);
      await query("select public.decide_leave_request($1,'approved',null)", [requestId]);
      await denied("select public.decide_leave_request($1,'approved',null)", "55000", [requestId]);
    });
    await query("update public.leave_types set is_active=false where id=$1", [leaveType]);
    await auth(employee, async () => {
      assert.equal(await scalar("select count(*)::integer from public.leave_types where id=$1", [leaveType]), 1);
      await denied(submitSql, "22023", [leaveType, "2030-02-04", "2030-02-05", "Synthetic inactive leave", id(934), null, null]);
    });
  });
  await check("required leave documents require actual owned objects and designated approver access", async () => {
    const values = [docType, "2030-02-04", "2030-02-05", "Synthetic document leave", id(935)];
    await auth(employee, async () => {
      await denied(submitSql, "22023", [...values, null, null]);
      await denied(submitSql, "42501", [...values, leavePath, "document.pdf"]);
      await denied("insert into storage.objects(bucket_id,name,owner_id) values('leave-documents',$1,$2)", "42501", [`${employee.uid}/nested/file.pdf`, employee.uid]);
    });
    await upload(employee, "leave-documents", leavePath);
    await query("update storage.objects set owner_id=$1 where name=$2", [colleague.uid, leavePath]);
    await auth(employee, () => denied(submitSql, "42501", [...values, leavePath, "document.pdf"]));
    await query("update storage.objects set owner_id=$1 where name=$2", [employee.uid, leavePath]);
    await auth(employee, () => scalar(submitSql, [...values, leavePath, "document.pdf"]));
    for (const person of [employee, manager]) await auth(person, async () => assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [leavePath]), 1));
    for (const person of [alternate, outsider, colleague]) await auth(person, async () => assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [leavePath]), 0));
    await as("service_role", null, () => denied("delete from storage.objects where name=$1", "23503", [leavePath]));
  });
  await check("announcement drafts, publication and attachments follow department RLS", async () => {
    await upload(manager, "announcement-files", firstFile);
    announcementId = await auth(manager, () => scalar(saveSql, [null, "Synthetic announcement", body, "draft", firstFile, "document.pdf", null]));
    await auth(employee, async () => {
      assert.equal(await scalar("select count(*)::integer from public.announcements where id=$1", [announcementId]), 0);
      assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [firstFile]), 0);
    });
    await auth(alternate, () => scalar(saveSql, [announcementId, "Synthetic announcement", body, "published", null, null, null]));
    await auth(employee, async () => {
      assert.equal(await scalar("select count(*)::integer from public.announcements where id=$1", [announcementId]), 1);
      assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [firstFile]), 1);
    });
    await auth(outsider, async () => {
      assert.equal(await scalar("select count(*)::integer from public.announcements where id=$1", [announcementId]), 0);
      await denied(saveSql, "42501", [announcementId, "Outsider attempt", body, "published", null, null, null]);
    });
    await query(`insert into public.announcements(author_id,title,body,category,status,published_at)
      values($1,'Synthetic company announcement',$2,'company_news','published',now())`, [manager.employee, body]);
    for (const person of [people.invited, people.disabled, people.incomplete, people.inactive]) await auth(person, async () => {
      assert.equal(await scalar("select count(*)::integer from public.announcements"), 0);
      assert.equal(await scalar("select count(*)::integer from public.tasks"), 0);
      assert.equal(await scalar("select count(*)::integer from public.leave_requests"), 0);
    });
  });
  await check("announcement replacement uses expected-path CAS and owner-only replacement", async () => {
    await upload(alternate, "announcement-files", otherManagerFile);
    await auth(alternate, () => denied(saveSql, "42501", [announcementId, "Synthetic announcement", body, "published", otherManagerFile, "document.pdf", firstFile]));
    await upload(manager, "announcement-files", replacementFile);
    await upload(manager, "announcement-files", staleFile);
    await auth(manager, async () => {
      await scalar(saveSql, [announcementId, "Synthetic announcement", body, "published", replacementFile, "document.pdf", firstFile]);
      await denied(saveSql, "55000", [announcementId, "Synthetic announcement", body, "published", staleFile, "document.pdf", firstFile]);
      assert.equal(await scalar("select attachment_path from public.announcements where id=$1", [announcementId]), replacementFile);
      assert.equal((await query("delete from storage.objects where name=$1 returning id", [firstFile])).length, 1);
      assert.equal((await query("delete from storage.objects where name=$1 returning id", [staleFile])).length, 1);
      assert.equal((await query("delete from storage.objects where name=$1 returning id", [replacementFile])).length, 0);
      assert.equal(await scalar("select public.portal_object_unreferenced('announcement-files',$1)", [otherManagerFile]), false);
    });
    await auth(alternate, async () => assert.equal((await query("delete from storage.objects where name=$1 returning id", [otherManagerFile])).length, 1));
    await as("service_role", null, async () => {
      await denied("delete from storage.objects where name=$1", "23503", [replacementFile]);
      await denied("update storage.objects set name=$1 where name=$2", "23503", [path(manager, 910), replacementFile]);
    });
  });
  await check("account disabling immediately revokes access despite outstanding work", async () => {
    await query("update public.employees set account_status='disabled' where id=$1", [employee.employee]);
    await auth(employee, async () => {
      assert.equal(await scalar("select public.current_employee_id()"), null);
      assert.deepEqual(await query("select * from public.my_tasks()"), []);
      assert.equal(await scalar("select count(*)::integer from storage.objects"), 0);
      await denied("select public.update_task_progress($1,'completed',null)", "42501", [taskId]);
    });
    await query("update public.employees set account_status='active' where id=$1", [employee.employee]);
    await query("update public.employees set account_status='disabled' where id=$1", [manager.employee]);
    await auth(manager, () => denied("select public.decide_leave_request((select id from public.leave_requests limit 1),'approved',null)", "42501"));
    await query("update public.employees set account_status='active' where id=$1", [manager.employee]);
  });
  await check("relationship changes require rerouting and transferred uploaders lose old referenced documents", async () => {
    await denied("update public.employees set department_id=$1 where id=$2", "23514", [deptB, employee.employee]);
    await denied("update public.employees set role='employee',approver_id=$1 where id=$2", "23514", [alternate.employee, manager.employee]);
    await db.exec("begin");
    try {
      await query("update public.employees set approver_id=$1 where approver_id=$2", [alternate.employee, manager.employee]);
      await query("update public.leave_requests set approver_id=$1 where approver_id=$2 and status='pending'", [alternate.employee, manager.employee]);
      await query("update public.employees set department_id=$1 where id=$2", [deptB, manager.employee]);
      await db.exec("commit");
    } catch (error) { await db.exec("rollback"); throw error; }
    await auth(manager, async () => {
      assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [replacementFile]), 0);
      assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [leavePath]), 0);
      assert.equal(await scalar("select count(*)::integer from public.announcements where id=$1", [announcementId]), 0);
    });
    await auth(alternate, async () => {
      assert.equal(await scalar("select count(*)::integer from storage.objects where name=$1", [leavePath]), 1);
      await query("select public.decide_leave_request((select id from public.leave_requests where status='pending' limit 1),'rejected','Synthetic rerouted rejection')");
      await query("select public.archive_department_task($1)", [taskId]);
    });
    await auth(employee, async () => assert.deepEqual(await query("select * from public.my_tasks()"), []));
  });
}
