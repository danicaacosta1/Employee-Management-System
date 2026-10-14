"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth/actions";
import { BellIcon, ChevronDownIcon, ListIcon, LogOutIcon, UserIcon } from "@/components/ui/icons";
import { InitialsAvatar, cx } from "./ui";
import { usePortal } from "./portal-context";

function TodayLabel() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // Client clock avoids a server/browser timezone mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(`Today, ${today}`);
  }, []);
  return <span className="text-[11px] text-slate-500">{label}</span>;
}

export function PortalHeader({
  variant,
  name,
  position,
  onMenu,
}: {
  variant: "employee" | "manager";
  name: string;
  position: string | null;
  onMenu: () => void;
}) {
  const { basePath, preview } = usePortal();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const manager = variant === "manager";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          className="rounded p-1 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <ListIcon className="size-4" />
        </button>
        {manager ? (
          <span className="text-[9.5px] font-semibold tracking-wider text-slate-500 uppercase">Department Workspace</span>
        ) : (
          <TodayLabel />
        )}
      </div>

      <div className="flex items-center gap-4">
        <span
          className={cx("relative text-red-500", manager && "flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600")}
          aria-label="Notifications"
        >
          <BellIcon className="size-3.5" />
          {manager && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-red-500" aria-hidden />}
        </span>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1 hover:bg-slate-50"
          >
            {manager ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-[#2563eb] text-white" aria-hidden>
                <UserIcon className="size-3.5" />
              </span>
            ) : (
              <InitialsAvatar name={name} className="size-7" />
            )}
            <span className="text-left leading-tight">
              <span className={cx("block text-[11px] font-bold text-slate-900", !manager && "uppercase")}>{name}</span>
              {position && <span className="block text-[9.5px] text-slate-500">{position}</span>}
            </span>
            <ChevronDownIcon className="size-3.5 text-slate-500" />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {!manager && (
                <Link
                  role="menuitem"
                  href={`${basePath}/profile`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
                >
                  <UserIcon className="size-3.5" /> My Profile
                </Link>
              )}
              <form action={preview ? undefined : signOut}>
                <button
                  role="menuitem"
                  type={preview ? "button" : "submit"}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
                >
                  <LogOutIcon className="size-3.5" /> Logout
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
