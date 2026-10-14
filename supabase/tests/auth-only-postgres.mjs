// In-memory PostgreSQL only; no .env, URLs, Supabase API or email calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../.local-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import {btree_gist} from '../../.local-db-test/node_modules/@electric-sql/pglite/dist/contrib/btree_gist.js';
const old=await readFile(new URL('./local-postgres.mjs',import.meta.url),'utf8');
const bootstrap=old.match(/const bootstrap = `([\s\S]*?)`;/)[1];
try { for(const legacy of [false,true]) {
 const db=new PGlite({extensions:{btree_gist}});
 await db.exec(bootstrap);
 if(legacy) for(const name of ['20261014000000_auth_employees','20261014010000_employee_portal','20261014020000_manager_portal','20261014030000_activation_safety']) await db.exec(await readFile(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../auth_only.sql',import.meta.url),'utf8'));
 const provision=await readFile(new URL('../provision_initial_accounts.sql',import.meta.url),'utf8');
 await assert.rejects(db.exec(provision),/Employee IDs pending/); await db.exec('rollback');
 await db.exec("set ems.provision_manager_code='TEST-MANAGER'; set ems.provision_employee_code='TEST-EMPLOYEE';");
 await db.exec(provision); await db.exec(provision);
 await assert.rejects(db.exec("insert into public.employees(employee_code,email,first_name,last_name,role) values('UNAUTHORIZED','other@example.invalid','Other','User','employee')"),/employees_demo_identity/);
 assert.equal((await db.query('select count(*)::int as n from public.employees')).rows[0].n,2);
 assert.equal((await db.query("select has_table_privilege('authenticated','public.employees','SELECT') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.claim_account_activation(text,text)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.complete_first_time_setup(text)','EXECUTE') as allowed")).rows[0].allowed,true);
 const claim=(await db.query("select * from public.claim_account_activation('TEST-EMPLOYEE','margaretsubong92@gmail.com')")).rows[0];
 assert.ok(claim.claim_token);
 await db.exec('reset role');
 const uid='11111111-1111-4111-8111-111111111111';
 await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',[uid,'margaretsubong92@gmail.com','synthetic-hash']);
 await db.exec('set role ems_migrator');
 assert.equal((await db.query('select public.link_account_activation($1,$2,$3,$4) as ok',[claim.employee_id,claim.claim_token,uid,'employee'])).rows[0].ok,true);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.session_profile()')).rows[0].account_status,'invited');
 await db.query('select public.complete_first_time_setup($1)',['sample.user']);
 assert.equal((await db.query('select * from public.session_profile()')).rows[0].account_status,'active');
 await assert.rejects(db.query('select public.complete_first_time_setup($1)',['again.user']),/setup not allowed/);
 await db.exec('set role service_role');
 assert.equal((await db.query("select public.can_recover_account('margaretsubong92@gmail.com') as ok")).rows[0].ok,true);
 await db.exec("update public.employees set account_status='disabled' where user_id='11111111-1111-4111-8111-111111111111'");
 assert.equal((await db.query("select public.can_recover_account('margaretsubong92@gmail.com') as ok")).rows[0].ok,false);
 await db.exec('set role authenticated'); assert.equal((await db.query('select * from public.session_profile()')).rows.length,0);
 if(legacy) assert.equal((await db.query("select has_function_privilege('authenticated','public.update_own_profile(text,text)','EXECUTE') as allowed")).rows[0].allowed,false);
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from public.session_profile()'),/permission denied/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id) values('leave-documents','11111111-1111-4111-8111-111111111111/demo.pdf','11111111-1111-4111-8111-111111111111')"),legacy?/row-level security|permission denied/:/foreign key|row-level security/);
 await db.exec('set role ems_migrator');
 await assert.rejects(db.exec("update public.employees set role='department_manager' where email='margaretsubong92@gmail.com'"),/employees_demo_identity/);
 await assert.rejects(db.exec("update public.employees set employee_code='TEST-MANAGER' where email='margaretsubong92@gmail.com'"),/employees_employee_code_key/);
 await db.close(); console.log((legacy?'Existing four-migration':'Fresh auth-only')+' schema: PASS');
}

} catch (error) { console.error(error.message, error.detail ?? ''); process.exitCode=1; }



