// Explicitly authorized two-account provisioning. Creates no passwords and sends no email.
// Run only with owner authorization: node --env-file=.env.local supabase/provision_authorized_accounts.mjs
import { createClient } from "@supabase/supabase-js";

const expectedUrl = "https://yckjdcwvvcbmkbgjqzsg.supabase.co";
const profiles = [
  { employee_code: "EMS-0001", email: "danicaacosta544@gmail.com", role: "department_manager", first_name: "Danica", last_name: "Acosta" },
  { employee_code: "EMS-0002", email: "margaretsubong92@gmail.com", role: "employee", first_name: "Margaret", last_name: "Subong" },
];

async function main() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== expectedUrl || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Expected project or server key is unavailable");
  const admin = createClient(expectedUrl, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing, error: profileError } = await admin.from("employees")
    .select("id,employee_code,email,role,user_id,account_status");
  if (profileError) throw new Error("Cannot inspect account records");
  for (const row of existing) {
    const expected = profiles.find(p => p.email === row.email);
    if (!expected || row.employee_code !== expected.employee_code || row.role !== expected.role)
      throw new Error("Existing account conflicts with authorized provisioning");
  }
  // Inspect the Auth directory before creating anything. Never print directory data or credentials.
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Cannot inspect Auth users");
    users.push(...data.users);
    if (data.users.length < 100) break;
  }
  const missing = profiles.filter(p => !existing.some(row => row.email === p.email));
  if (missing.length) {
    const { error } = await admin.from("employees").insert(missing);
    if (error) throw new Error("Eligibility insertion failed; no Auth creation attempted");
  }
  for (const profile of profiles) {
    const matches = users.filter(u => u.email?.toLowerCase() === profile.email);
    if (matches.length > 1) throw new Error("Duplicate Auth identity requires review");
    let user = matches[0];
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email: profile.email, email_confirm: false });
      if (error || !data.user) throw new Error(`Auth creation failed for ${profile.employee_code}`);
      user = data.user;
    }
    const row = existing.find(r => r.email === profile.email);
    if (row?.user_id && row.user_id !== user.id) throw new Error("Existing Auth link requires review");
    if (!row?.user_id) {
      const { data, error } = await admin.from("employees").update({ user_id: user.id })
        .eq("email", profile.email).eq("employee_code", profile.employee_code).is("user_id", null).select("id");
      if (error || data?.length !== 1) throw new Error(`Account linking failed for ${profile.employee_code}`);
    }
    const { data: verified, error } = await admin.from("employees").select("employee_code,email,role,user_id,account_status")
      .eq("email", profile.email).single();
    if (error || verified.user_id !== user.id) throw new Error("Account verification failed");
    console.log(JSON.stringify({ employeeId: verified.employee_code, email: verified.email,
      role: verified.role, status: verified.account_status, authUserExists: true,
      emailVerified: !!user.email_confirmed_at }));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
