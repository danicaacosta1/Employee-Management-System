const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export const PASSWORD_MIN = 8;

export function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(email: string) {
  if (!email) return "Company email is required.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}

export function validateEmployeeCode(code: string) {
  if (!code) return "Employee ID is required.";
  if (!EMPLOYEE_CODE_RE.test(code)) return "Enter a valid Employee ID (e.g. EMP-2025-4102).";
  return null;
}

export function validateUsername(username: string) {
  if (!username) return "Username is required.";
  if (!USERNAME_RE.test(username))
    return "Use 3–30 lowercase letters, numbers, dots or underscores.";
  return null;
}

export function validatePassword(password: string) {
  if (!password) return "Password is required.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 72) return "Use at most 72 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return "Include at least one letter and one number.";
  return null;
}

export function validateConfirm(password: string, confirm: string) {
  if (!confirm) return "Confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

/** Complexity standards shown on the profile "Update Account Password" panel. */
export const PASSWORD_RULES = [
  { id: "length", label: `At least ${PASSWORD_MIN} characters`, test: (p: string) => p.length >= PASSWORD_MIN },
  { id: "case", label: "Upper & lowercase", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "number", label: "Number (0-9)", test: (p: string) => /\d/.test(p) },
  { id: "symbol", label: "Symbol (!@#$%)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function validateStrongPassword(password: string) {
  const base = validatePassword(password);
  if (base) return base;
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failed ? `Password must meet: ${failed.label.toLowerCase()}.` : null;
}
