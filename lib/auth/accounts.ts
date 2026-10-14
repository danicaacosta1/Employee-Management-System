import type { Role } from "./roles";

/** Demo eligibility is fixed; the database remains the authority for status and role. */
const ACCOUNTS: Readonly<Record<string, Role>> = {
  "danicaacosta544@gmail.com": "department_manager",
  "margaretsubong92@gmail.com": "employee",
};

export function isAuthorizedAccount(email: string, role?: Role): boolean {
  const expected = ACCOUNTS[email.trim().toLowerCase()];
  return expected !== undefined && (role === undefined || expected === role);
}
