export type Role = "department_manager" | "employee";

export function isRole(value: unknown): value is Role {
  return value === "department_manager" || value === "employee";
}

/** URL prefix of the portal a role may access. */
export function rolePrefix(role: Role) {
  return role === "department_manager" ? "/manager" : "/employee";
}

export function roleHome(role: Role) {
  return `${rolePrefix(role)}/dashboard`;
}

/** Only same-origin relative paths are allowed as post-auth destinations. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  const url = new URL(next, "https://ems.invalid");
  return `${url.pathname}${url.search}${url.hash}`;
}
