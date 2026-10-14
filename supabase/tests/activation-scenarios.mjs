import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** Synthetic SQL fixtures only; no real Auth users or notification APIs. */
export async function verifyActivation({ db, query, scalar, as, denied, check }) {
  const provision = await readFile(new URL("../provision_initial_accounts.sql", import.meta.url), "utf8");
  const settings = {
    department_code: "ZZ", department_name: "Synthetic Provisioning",
    manager_code: "SYN-MGR", manager_email: "manager@ems-synthetic.invalid",
    manager_first_name: "Synthetic", manager_last_name: "Manager",
    employee_code: "SYN-EMP", employee_email: "employee@ems-synthetic.invalid",
    employee_first_name: "Synthetic", employee_last_name: "Employee",
  };
  async function rejectedProvision() {
    try { await assert.rejects(() => db.exec(provision), (error) => error.code === "P0001"); }
    finally { await db.exec("rollback"); }
  }
  await check("provisioning missing settings fails closed", rejectedProvision);
  for (const [name, value] of Object.entries(settings)) {
    await query("select set_config($1, $2, false)", [`ems.provision_${name}`, value]);
  }
  await check("synthetic provisioning creates valid department and approver links", async () => {
    await db.exec(provision);
    assert.equal(await scalar("select count(*)::integer from public.employees where employee_code in ('SYN-MGR','SYN-EMP')"), 2);
    assert.equal(await scalar(`select e.department_id=m.department_id and e.approver_id=m.id
      from public.employees e join public.employees m on m.employee_code='SYN-MGR'
      where e.employee_code='SYN-EMP'`), true);
  });
  const employee = (await query("select id from public.employees where employee_code='SYN-EMP'"))[0].id;
  const manager = (await query("select id from public.employees where employee_code='SYN-MGR'"))[0].id;
  await check("provisioning exact rerun preserves profiles and conflicting identity rolls back", async () => {
    await db.exec(provision);
    assert.equal(await scalar("select id from public.employees where employee_code='SYN-EMP'"), employee);
    await query("select set_config('ems.provision_manager_email', 'conflict@ems-synthetic.invalid', false)");
    await rejectedProvision();
    await query("select set_config('ems.provision_manager_email', $1, false)", [settings.manager_email]);
    assert.equal(await scalar("select email from public.employees where id=$1", [manager]), settings.manager_email);
  });
  let claim;
  await check("activation claim is service-only and unknown eligibility returns nothing", async () => {
    await as("authenticated", null, () => denied("select * from public.claim_account_activation('SYN-EMP','employee@ems-synthetic.invalid')", "42501"));
    await as("anon", null, () => denied("select * from public.claim_account_activation('SYN-EMP','employee@ems-synthetic.invalid')", "42501"));
    await as("service_role", null, async () => {
      assert.equal((await query("select * from public.claim_account_activation('UNKNOWN','unknown@ems-synthetic.invalid')")).length, 0);
      claim = (await query("select * from public.claim_account_activation($1,$2)", [settings.employee_code, settings.employee_email]))[0];
      assert.equal(claim.employee_id, employee);
    });
  });
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  await query("insert into auth.users(id,email) values ($1,$2)", [userId, settings.employee_email]);
  await check("competing activation is cooled down and wrong lease cannot reconcile or link", async () => {
    await as("service_role", null, async () => {
      assert.equal((await query("select * from public.claim_account_activation($1,$2)", [settings.employee_code, settings.employee_email])).length, 0);
      const wrong = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      assert.equal((await query("select * from public.activation_auth_user($1,$2)", [employee, wrong])).length, 0);
      assert.equal(await scalar("select public.link_account_activation($1,$2,$3,'employee')", [employee, wrong, userId]), false);
      assert.equal((await query("select * from public.activation_auth_user($1,$2)", [employee, claim.claim_token]))[0].user_id, userId);
    });
  });
  await check("valid activation prelinks as invited without exposing protected tables or lease fields", async () => {
    await as("service_role", null, async () => {
      assert.equal(await scalar("select public.link_account_activation($1,$2,$3,'employee')", [employee, claim.claim_token, userId]), true);
    });
    await as("authenticated", userId, async () => {
      assert.equal((await query("select * from public.session_profile()"))[0].account_status, "invited");
      assert.equal(await scalar("select count(*)::integer from public.employees"), 0);
      await denied("select activation_claim_token from public.employees", "42501");
      await denied("select public.complete_first_time_setup('synthetic.employee')", "42501");
    });
  });
  await check("setup requires confirmed email and password; username collision rolls back activation", async () => {
    await query("update auth.users set email_confirmed_at=now() where id=$1", [userId]);
    await as("authenticated", userId, () => denied("select public.complete_first_time_setup('synthetic.employee')", "42501"));
    await query("update auth.users set encrypted_password='synthetic-test-hash' where id=$1", [userId]);
    await query("update public.employees set username='reserved.username' where id=$1", [manager]);
    await as("authenticated", userId, () => denied("select public.complete_first_time_setup('reserved.username')", "23505"));
    assert.equal(await scalar("select account_status from public.employees where id=$1", [employee]), "invited");
    await as("authenticated", userId, async () => {
      await query("select public.complete_first_time_setup('synthetic.employee')");
      assert.equal(await scalar("select public.current_employee_id()"), employee);
      await denied("select public.complete_first_time_setup('different.username')", "42501");
    });
  });
  await check("release cannot demote an activated profile and provisioning preserves setup state", async () => {
    await as("service_role", null, () => query("select public.release_account_activation($1,$2,true)", [employee, claim.claim_token]));
    await db.exec(provision);
    assert.equal(await scalar("select account_status from public.employees where id=$1", [employee]), "active");
    assert.equal(await scalar("select username from public.employees where id=$1", [employee]), "synthetic.employee");
  });
  await check("disable during activation invalidates linking without resurrecting profile", async () => {
    let managerClaim;
    await as("service_role", null, async () => {
      managerClaim = (await query("select * from public.claim_account_activation($1,$2)", [settings.manager_code, settings.manager_email]))[0];
    });
    const managerUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    await query("insert into auth.users(id,email,email_confirmed_at,encrypted_password) values ($1,$2,now(),'synthetic-test-hash')", [managerUser, settings.manager_email]);
    await query("update public.employees set account_status='disabled' where id=$1", [manager]);
    await as("service_role", null, async () => {
      assert.equal(await scalar("select public.link_account_activation($1,$2,$3,'department_manager')", [manager, managerClaim.claim_token, managerUser]), false);
      assert.equal((await query("select * from public.activation_auth_user($1,$2)", [manager, managerClaim.claim_token])).length, 0);
      assert.equal((await query("select * from public.claim_account_activation($1,$2)", [settings.manager_code, settings.manager_email])).length, 0);
      await query("select public.release_account_activation($1,$2,false)", [manager, managerClaim.claim_token]);
    });
    assert.equal(await scalar("select account_status from public.employees where id=$1", [manager]), "disabled");
  });
}
