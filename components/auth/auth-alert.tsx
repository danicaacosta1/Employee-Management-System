import { AlertCircleIcon, CheckCircleIcon } from "@/components/ui/icons";

export function AuthAlert({
  tone = "error",
  title,
  message,
}: {
  tone?: "error" | "success";
  title?: string;
  message: string;
}) {
  const error = tone === "error";
  const Icon = error ? AlertCircleIcon : CheckCircleIcon;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-5 flex gap-2 rounded-md border px-3 py-2.5 text-[12px] leading-[17px] ${
        error ? "border-red-200 bg-red-50 text-red-600" : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <Icon className="mt-px size-4 shrink-0" />
      <div>
        <p className="font-semibold">{title ?? (error ? "Authentication failed" : "Success")}</p>
        <p>{message}</p>
      </div>
    </div>
  );
}
