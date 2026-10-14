"use client";
import { useDemoProfile } from "@/lib/employee/demo-store";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/employee/types";
import { EMPLOYMENT_TYPE } from "@/lib/employee/labels";
import { formatDay, initials } from "@/lib/employee/format";
import { PASSWORD_RULES } from "@/lib/auth/validation";
import { changePassword, updateOwnProfile, type ActionResult } from "@/lib/employee/actions";
import {
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  CircleIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  IdCardIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  UserIcon,
} from "@/components/ui/icons";
import { FormMessage, buttonClass, cx, type IconType } from "../ui";

function Tag({ tone, children }: { tone: "green" | "gray"; children: ReactNode }) {
  return (
    <span className={cx("text-[9px] font-semibold", tone === "green" ? "text-emerald-600" : "text-slate-400")}>{children}</span>
  );
}

function InfoField({
  label,
  tag,
  icon: Icon,
  value,
  name,
  editing,
  error,
  type = "text",
}: {
  label: string;
  tag?: ReactNode;
  icon: IconType;
  value: string;
  /** Present only for self-service fields. */
  name?: string;
  editing?: boolean;
  error?: string;
  type?: string;
}) {
  const editable = !!name && editing;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={name ? `profile-${name}` : undefined} className="text-[10.5px] font-medium text-slate-700">
          {label}
        </label>
        {tag}
      </div>
      <div
        className={cx(
          "flex h-8 items-center gap-2 rounded-md border px-2.5",
          editable ? "border-slate-300 bg-white focus-within:border-[#2563eb]" : "border-transparent bg-[#eef2f7]",
        )}
      >
        {editable ? (
          <input
            id={`profile-${name}`}
            name={name}
            type={type}
            defaultValue={value}
            className="h-full min-w-0 flex-1 bg-transparent text-[11.5px] text-slate-800 outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-700">{value || "—"}</span>
        )}
        <Icon className="size-3 shrink-0 text-slate-400" />
      </div>
      {error && <p className="mt-1 text-[10.5px] text-red-600">{error}</p>}
    </div>
  );
}

function PasswordInput({ id, name, label, aside, placeholder, error, onChange }: {
  id: string;
  name: string;
  label: string;
  aside?: ReactNode;
  placeholder: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOffIcon : EyeIcon;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-[10.5px] font-medium text-slate-700">
          {label}
        </label>
        {aside}
      </div>
      <div className="flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 focus-within:border-[#2563eb]">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[11.5px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="rounded p-0.5 text-slate-400 hover:text-slate-600"
        >
          <Toggle className="size-3.5" />
        </button>
      </div>
      {error && <p className="mt-1 text-[10.5px] text-red-600">{error}</p>}
    </div>
  );
}

export function ProfileView({ profile: initialProfile }: { profile: Profile }) {
  const profile = useDemoProfile(initialProfile);
  const router = useRouter();
  const passwordRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [profileResult, setProfileResult] = useState<ActionResult>({});
  const [passwordResult, setPasswordResult] = useState<ActionResult>({});
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, startProfile] = useTransition();
  const [savingPassword, startPassword] = useTransition();

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const active = profile.employmentStatus === "active";

  function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startProfile(async () => {
      const res = await updateOwnProfile(form);
      setProfileResult(res);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    startPassword(async () => {
      const res = await changePassword(form);
      setPasswordResult(res);
      if (res.ok) {
        formEl.reset();
        setNewPassword("");
      }
    });
  }

  function resetPasswordForm() {
    passwordRef.current?.reset();
    setNewPassword("");
    setPasswordResult({});
  }

  const pe = profileResult.fieldErrors ?? {};
  const pwe = passwordResult.fieldErrors ?? {};

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Identity header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-20 rounded-lg object-cover" />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-lg bg-slate-200 text-[22px] font-semibold text-slate-600">
                {initials(fullName)}
              </span>
            )}
            <span
              className={cx("absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 border-white", active ? "bg-emerald-500" : "bg-slate-400")}
              aria-hidden
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-bold text-slate-900 uppercase">{fullName}</h1>
              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#2563eb]">
                <IdCardIcon className="size-3" />
                {profile.employeeCode}
              </span>
            </div>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-600">
              <span className="size-1.5 rounded-full bg-current" />
              {EMPLOYMENT_TYPE[profile.employmentType] ?? profile.employmentType} · {active ? "Active" : profile.employmentStatus.replace("_", " ")}
            </span>
            <p className="mt-1 text-[11px] text-slate-600">
              {[profile.position, profile.department].filter(Boolean).join("  ·  ") || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Digital ID download will be available once HR issues ID cards."
            className={cx(buttonClass("secondary"), "opacity-60")}
          >
            <DownloadIcon className="size-3.5" /> Digital ID
          </button>
          <button
            type="button"
            onClick={() => {
              passwordRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              passwordRef.current?.querySelector("input")?.focus({ preventScroll: true });
            }}
            className={buttonClass("primary")}
          >
            <KeyIcon className="size-3.5" /> Update Password
          </button>
        </div>
      </div>

      {/* Personal information */}
      <form onSubmit={saveProfile} noValidate className="mb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900">Personal Information</h2>
            <p className="max-w-[340px] text-[10px] text-slate-500">
              Manage your baseline identity attributes and verified workplace credentials
            </p>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setProfileResult({});
                }}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
              <button type="submit" disabled={savingProfile} className={buttonClass("primary")}>
                {savingProfile && <SpinnerIcon className="size-3.5 animate-spin" />}
                Save Details
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setProfileResult({});
              }}
              className={cx(buttonClass("soft"), "h-auto py-1.5")}
            >
              <PencilIcon className="size-3" /> Edit Details
            </button>
          )}
        </div>

        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <InfoField label="Full Legal Name" tag={<Tag tone="green">Self-service</Tag>} icon={UserIcon} value={fullName} name="fullName" editing={editing} error={pe.fullName} />
          <InfoField label="Employee System ID" tag={<Tag tone="gray">Immutable</Tag>} icon={LockIcon} value={profile.employeeCode} />
          <InfoField label="Primary Email" tag={<Tag tone="green">Verified</Tag>} icon={MailIcon} value={profile.email} />
          <InfoField label="Contact Number" tag={<Tag tone="green">Self-service</Tag>} icon={PhoneIcon} value={profile.phone ?? ""} name="phone" type="tel" editing={editing} error={pe.phone} />
          <InfoField label="Department" tag={<Tag tone="gray">Org Chart</Tag>} icon={LockIcon} value={profile.department ?? ""} />
          <InfoField label="Title & Level" tag={profile.jobLevel ? <Tag tone="gray">{profile.jobLevel}</Tag> : undefined} icon={LockIcon} value={profile.position ?? ""} />
          <InfoField label="Office Facility & Desk" icon={BuildingIcon} value={profile.officeLocation ?? ""} />
          <InfoField label="Tenure Start Date" icon={CalendarIcon} value={profile.hireDate ? formatDay(profile.hireDate, { month: "long", day: "numeric", year: "numeric" }) : ""} />
        </div>
        <div className="mt-3">
          <FormMessage error={profileResult.error} message={profileResult.message} />
        </div>
      </form>

      {/* Password */}
      <form
        ref={passwordRef}
        onSubmit={savePassword}
        noValidate
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <ShieldCheckIcon className="size-3.5 text-[#2563eb]" /> Password Validation Demo
          </h2>
          <span className="text-[9px] text-slate-400">Policy v4.2</span>
        </div>
        <p className="mb-3 text-[10.5px] text-slate-500">Use sample passwords here. This demo never verifies or changes account credentials. <a href="/forgot-password" className="text-[#2563eb] underline">Reset your actual password</a>.</p>
        <div className="space-y-3">
          <PasswordInput id="pw-current" name="currentPassword" label="Current Password" placeholder="••••••••••••" error={pwe.currentPassword} />
          <PasswordInput
            id="pw-new"
            name="newPassword"
            label="New Password"
            aside={<span className="text-[9px] text-slate-400">Min. 8 characters</span>}
            placeholder="Enter new password"
            error={pwe.newPassword}
            onChange={setNewPassword}
          />
          <PasswordInput id="pw-confirm" name="confirmPassword" label="Confirm New Password" placeholder="Repeat new password" error={pwe.confirmPassword} />
        </div>

        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <p className="mb-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">Complexity Standards</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(newPassword);
              const Icon = met ? CheckCircleIcon : CircleIcon;
              return (
                <li key={rule.id} className={cx("flex items-center gap-1.5 text-[10px]", met ? "text-emerald-600" : "text-slate-500")}>
                  <Icon className="size-3" />
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <FormMessage error={passwordResult.error} message={passwordResult.message} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={resetPasswordForm} className={buttonClass("ghost")}>
              Cancel
            </button>
            <button type="submit" disabled={savingPassword} className={buttonClass("primary")}>
              {savingPassword && <SpinnerIcon className="size-3.5 animate-spin" />}
              Validate Demo Password
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
