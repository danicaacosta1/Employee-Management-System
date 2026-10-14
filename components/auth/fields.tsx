"use client";

import { useId, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from "@/components/ui/icons";

type FieldProps = {
  label: string;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  /** Small uppercase hint or link rendered at the right of the label. */
  aside?: ReactNode;
  /** Tinted style used by the login password field in the design. */
  tint?: "rose";
};

function FieldShell({
  id,
  label,
  aside,
  error,
  tint,
  icon: Icon,
  children,
}: Pick<FieldProps, "label" | "aside" | "error" | "tint" | "icon"> & {
  id: string;
  children: ReactNode;
}) {
  const rose = tint === "rose";
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold text-slate-800">
          {label}
        </label>
        {aside}
      </div>
      <div
        className={`flex h-11 items-center gap-2.5 rounded-md border px-3.5 transition-colors focus-within:border-[#1e3a8a] focus-within:ring-2 focus-within:ring-[#1e3a8a]/15 ${
          error
            ? "border-red-300 bg-white"
            : rose
              ? "border-[#f6dadf] bg-[#fdeef1]"
              : "border-slate-200 bg-white"
        }`}
      >
        <Icon className={`size-4 shrink-0 ${rose ? "text-rose-500" : "text-slate-400"}`} />
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11.5px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "h-full min-w-0 flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400";

export function TextField({
  label,
  name,
  icon,
  placeholder,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  aside,
  tint,
}: FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} aside={aside} error={error} tint={tint} icon={icon}>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function PasswordField(props: Omit<FieldProps, "type" | "defaultValue">) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOffIcon : EyeIcon;
  return (
    <FieldShell
      id={id}
      label={props.label}
      aside={props.aside}
      error={props.error}
      tint={props.tint}
      icon={props.icon}
    >
      <input
        id={id}
        name={props.name}
        type={visible ? "text" : "password"}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${id}-error` : undefined}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="-mr-1 rounded p-1 text-slate-500 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[#1e3a8a]"
      >
        <Toggle className="size-4" />
      </button>
    </FieldShell>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[#1e3a8a] text-[13px] font-medium text-white transition-colors hover:bg-[#1a327a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a8a] disabled:cursor-not-allowed disabled:opacity-75"
    >
      {pending ? <SpinnerIcon className="size-4 animate-spin" /> : null}
      {children}
      {!pending && <ArrowRightIcon className="size-3.5" />}
    </button>
  );
}
