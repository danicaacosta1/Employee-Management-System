// Owner-requested Auth metadata only. Does not change credentials, email verification or database roles.
import { createClient } from "@supabase/supabase-js";

const projectUrl = "https://yckjdcwvvcbmkbgjqzsg.supabase.co";
const accounts = [
  { email: "danicaacosta544@gmail.com", employeeId: "EMS-0001", role: "department_manager" },
  { email: "margaretsubong92@gmail.com", employeeId: "EMS-0002", role: "employee" },
];

async function main() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Expected project configuration is unavailable");
  const admin = createClient(projectUrl, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const inspected = [];
  for (const account of accounts) {
    const { data: profile, error } = await admin.from("employees")
      .select("user_id,employee_code,role").eq("email", account.email).single();
    if (error || !profile.user_id || profile.employee_code !== account.employeeId || profile.role !== account.role)
      throw new Error("Account identity or role does not match approved record");
    const { data, error: authError } = await admin.auth.admin.getUserById(profile.user_id);
    if (authError || data.user?.email?.toLowerCase() !== account.email)
      throw new Error("Auth identity does not match approved record");
    inspected.push({ account, user: data.user });
  }
  for (const { account, user } of inspected) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, role: account.role, employee_id: account.employeeId },
    });
    if (error || data.user?.app_metadata?.role !== account.role || data.user?.app_metadata?.employee_id !== account.employeeId)
      throw new Error(`Metadata update failed for ${account.employeeId}`);
    console.log(JSON.stringify({ email: account.email, role: account.role, employeeId: account.employeeId, updated: true }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
