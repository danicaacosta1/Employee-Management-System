import Link from "next/link";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthCard, AuthFooter } from "@/components/auth/auth-card";

export default function AuthErrorPage() {
  return (
    <AuthCard title="Unable to Verify Link" subtitle="Your account verification could not be completed">
      <AuthAlert message="The link may be invalid, expired, or already used, or your account session could not be established. For first-time setup, request a fresh link through Activate Account. For an activated account, use Reset Password. Open only the newest email link." />
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/activate"
          className="flex h-11 items-center justify-center rounded-md bg-[#1e3a8a] text-[13px] font-medium text-white hover:bg-[#1a327a]"
        >
          Activate Account
        </Link>
        <Link
          href="/forgot-password"
          className="flex h-11 items-center justify-center rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-800 hover:bg-slate-50"
        >
          Reset Password
        </Link>
      </div>
      <AuthFooter>
        Back to{" "}
        <Link href="/login" className="font-semibold text-[#1e3a8a] hover:underline">
          Login
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
