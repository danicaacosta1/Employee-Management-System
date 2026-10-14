/** Authentication emails must return to the configured application origin. */
export function appOrigin(value = process.env.EMS_APP_URL): string {
  if (!value) throw new Error("EMS_APP_URL is not configured");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) throw new Error("EMS_APP_URL must be an HTTPS origin (HTTP localhost is allowed)");
  return url.origin;
}

export function callbackDestination(type: string | null, next: string | null): string | null {
  if (type === "invite" && next === "/setup") return next;
  if (type === "recovery" && (next === "/setup" || next === "/reset-password")) return next;
  return null;
}
